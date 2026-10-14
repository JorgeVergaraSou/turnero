import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import moment from 'moment-timezone';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status';
import {
  AppointmentEvents,
  AppointmentReminderPayload,
  toAppointmentEventPayload,
} from './appointment.events';
import { signConfirmToken } from './appointment-confirm-token.util';
import { SettingsService } from '@/settings/settings.service';
import { CLINIC_TIMEZONE } from '@/common/utils/clinic-time.util';
import { appointmentsErrorLogger } from '@/config/module-loggers';

/** Solo turnos que todavía van a ocurrir (un cancelado nunca se recuerda). */
const REMINDABLE = [AppointmentStatus.RESERVADO, AppointmentStatus.CONFIRMADO];
const DATETIME = 'YYYY-MM-DD HH:mm:ss';
/** Tope por corrida: el resto sale en la siguiente (cada 10 min). */
const BATCH_SIZE = 500;

type Stage = 1 | 2;

/**
 * Recordatorios de turno en dos etapas, ambas configurables ("X horas
 * antes", 0 = desactivada):
 *
 *   1.ª (por defecto 24 h antes): aviso con los datos del turno.
 *   2.ª (por defecto 2 h antes): último aviso, con el enlace para que el
 *       paciente confirme que va a venir. No sale si el paciente ya llegó o
 *       ya confirmó.
 *
 * Cada una busca los turnos que entraron en su ventana, reclama cada turno con
 * un UPDATE condicional y emite `appointment.reminder` con la etapa. Quién avisa
 * y por qué canal (mail, WhatsApp…) lo deciden los listeners.
 *
 * Garantías:
 * - nunca dos avisos de la misma etapa para un turno: el UPDATE … WHERE
 *   reminderN_sent_at IS NULL solo lo gana una ejecución, aunque la tarea corra
 *   solapada o haya varias instancias de la API;
 * - no se avisa por una etapa un turno reservado DENTRO de su ventana (ej. a la
 *   noche para la mañana siguiente): acaba de recibir la confirmación;
 * - un turno que entra a la ventana de la 2.ª etapa sin haber recibido la 1.ª
 *   (reservado tarde, o la tarea estuvo caída) recibe solo la 2.ª, nunca las
 *   dos juntas;
 * - reprogramar vuelve a null los dos reclamos y la confirmación del paciente
 *   (ver AppointmentsService.reschedule): se avisa por la fecha nueva.
 */
@Injectable()
export class AppointmentRemindersService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Devuelve los ids de los turnos a los que se les emitió algún recordatorio. */
  async sendDueReminders(): Promise<number[]> {
    const settings = await this.settingsService.get();
    const first = settings.reminderHoursBefore;
    const second = settings.secondReminderHoursBefore;
    const sent: number[] = [];
    // primero la 2.ª: así un turno que está en las dos ventanas ya no se
    // reclama como 1.ª (la 1.ª excluye la ventana de la 2.ª de todos modos)
    if (second > 0) sent.push(...(await this.sendStage(2, second, second)));
    if (first > 0) sent.push(...(await this.sendStage(1, first, second)));
    return sent;
  }

  /**
   * @param hours   ventana de esta etapa (horas antes del turno)
   * @param secondHours ventana de la 2.ª etapa (0 = desactivada), para que la
   *   1.ª no avise lo que le toca a la 2.ª
   */
  private async sendStage(
    stage: Stage,
    hours: number,
    secondHours: number,
  ): Promise<number[]> {
    const now = moment().tz(CLINIC_TIMEZONE);
    const until = now.clone().add(hours, 'hours');
    const sentColumn = stage === 1 ? 'reminderSentAt' : 'reminder2SentAt';
    const sentColumnSql =
      stage === 1 ? 'reminder_sent_at' : 'reminder2_sent_at';

    // fecha y hora del turno son locales del consultorio (DATE + TIME), así
    // que la ventana se compara contra "ahora" local, nunca contra UTC
    const query = this.appointmentRepository
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.patient', 'patient')
      .innerJoinAndSelect('appointment.professional', 'professional')
      .withDeleted()
      .innerJoinAndSelect('professional.user', 'professionalUser')
      .innerJoinAndSelect('appointment.specialty', 'specialty')
      .innerJoinAndSelect('appointment.office', 'office')
      .where('appointment.status IN (:...statuses)', {
        statuses: stage === 1 ? REMINDABLE : [AppointmentStatus.RESERVADO],
      })
      .andWhere(`appointment.${sentColumn} IS NULL`)
      // rango por fecha primero: usa el índice (date, professional_id);
      // TIMESTAMP(...) de abajo no puede usar índices, solo afina la ventana
      .andWhere('appointment.date BETWEEN :fromDate AND :toDate', {
        fromDate: now.format('YYYY-MM-DD'),
        toDate: until.format('YYYY-MM-DD'),
      })
      .andWhere('TIMESTAMP(appointment.date, appointment.startTime) > :now', {
        now: now.format(DATETIME),
      })
      .andWhere(
        'TIMESTAMP(appointment.date, appointment.startTime) <= :until',
        { until: until.format(DATETIME) },
      );

    if (stage === 1 && secondHours > 0) {
      // lo que ya está en la ventana de la 2.ª le toca a la 2.ª
      query.andWhere(
        'TIMESTAMP(appointment.date, appointment.startTime) > :secondUntil',
        {
          secondUntil: now.clone().add(secondHours, 'hours').format(DATETIME),
        },
      );
    }
    if (stage === 2) {
      // si ya avisó que viene, no hace falta pedirle que confirme
      query.andWhere('appointment.patientConfirmedAt IS NULL');
    }

    const candidates = await query
      .orderBy('appointment.date', 'ASC')
      .addOrderBy('appointment.startTime', 'ASC')
      .take(BATCH_SIZE)
      .getMany();

    const sent: number[] = [];
    for (const appointment of candidates) {
      const start = moment.tz(
        `${appointment.date} ${appointment.startTime}`,
        DATETIME,
        CLINIC_TIMEZONE,
      );
      const windowOpened = start.clone().subtract(hours, 'hours');
      if (moment(appointment.createdAt).isAfter(windowOpened)) {
        continue; // reservado dentro de la ventana: ya tiene su confirmación
      }

      const claim = this.appointmentRepository
        .createQueryBuilder()
        .update(AppointmentEntity)
        .set({ [sentColumn]: () => 'CURRENT_TIMESTAMP' })
        .where('id = :id', { id: appointment.id })
        .andWhere(`${sentColumnSql} IS NULL`)
        .andWhere('status IN (:...statuses)', {
          statuses: stage === 1 ? REMINDABLE : [AppointmentStatus.RESERVADO],
        });
      if (stage === 2) claim.andWhere('patient_confirmed_at IS NULL');
      if ((await claim.execute()).affected !== 1) {
        continue; // lo tomó otra ejecución, o cambió de estado recién
      }

      try {
        const payload: AppointmentReminderPayload = {
          ...toAppointmentEventPayload(appointment),
          stage,
          confirmUrl: this.confirmUrl(appointment),
        };
        await this.eventEmitter.emitAsync(AppointmentEvents.REMINDER, payload);
      } catch (error) {
        // un canal que falla no frena al resto de los recordatorios
        appointmentsErrorLogger.error(
          `[AppointmentRemindersService] recordatorio ${stage} del turno ${appointment.id} falló: ${error instanceof Error ? error.message : error}`,
        );
      }
      sent.push(appointment.id);
    }
    return sent;
  }

  /** Enlace "confirmo que voy" (null si no hay FRONTEND_URL para armarlo). */
  private confirmUrl(appointment: AppointmentEntity): string | null {
    const base = process.env.FRONTEND_URL?.replace(/\/+$/, '');
    if (!base) return null;
    return `${base}/confirmar?t=${signConfirmToken(appointment.id, appointment.code)}`;
  }
}
