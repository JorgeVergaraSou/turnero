import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import moment from 'moment-timezone';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status';
import {
  AppointmentEvents,
  toAppointmentEventPayload,
} from './appointment.events';
import { SettingsService } from '@/settings/settings.service';
import { CLINIC_TIMEZONE } from '@/common/utils/clinic-time.util';
import { appointmentsErrorLogger } from '@/config/module-loggers';

/** Solo turnos que todavía van a ocurrir (un cancelado nunca se recuerda). */
const REMINDABLE = [AppointmentStatus.RESERVADO, AppointmentStatus.CONFIRMADO];
const DATETIME = 'YYYY-MM-DD HH:mm:ss';
/** Tope por corrida: el resto sale en la siguiente (cada 10 min). */
const BATCH_SIZE = 500;

/**
 * Recordatorios de turno. Busca los turnos que entraron en la ventana de
 * aviso (configurable: "X horas antes", 0 = desactivado), reclama cada uno
 * con un UPDATE condicional y emite `appointment.reminder`. Quién avisa y
 * por qué canal (hoy mail; mañana WhatsApp/SMS) lo deciden los listeners.
 *
 * Garantías:
 * - nunca dos recordatorios del mismo turno: el UPDATE … WHERE
 *   reminder_sent_at IS NULL solo lo gana una ejecución, aunque la tarea
 *   corra solapada o haya varias instancias de la API;
 * - no se recuerda un turno reservado DENTRO de la ventana (ej. a la noche
 *   para la mañana siguiente): acaba de recibir la confirmación;
 * - reprogramar vuelve reminder_sent_at a null (ver
 *   AppointmentsService.reschedule): se recuerda la fecha nueva.
 */
@Injectable()
export class AppointmentRemindersService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Devuelve los ids de los turnos a los que se les emitió recordatorio. */
  async sendDueReminders(): Promise<number[]> {
    const { reminderHoursBefore: hours } = await this.settingsService.get();
    if (hours <= 0) {
      return [];
    }

    const now = moment().tz(CLINIC_TIMEZONE);
    const until = now.clone().add(hours, 'hours');

    // fecha y hora del turno son locales del consultorio (DATE + TIME), así
    // que la ventana se compara contra "ahora" local, nunca contra UTC
    const candidates = await this.appointmentRepository
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.patient', 'patient')
      .innerJoinAndSelect('appointment.professional', 'professional')
      .withDeleted()
      .innerJoinAndSelect('professional.user', 'professionalUser')
      .innerJoinAndSelect('appointment.specialty', 'specialty')
      .innerJoinAndSelect('appointment.office', 'office')
      .where('appointment.status IN (:...statuses)', { statuses: REMINDABLE })
      .andWhere('appointment.reminderSentAt IS NULL')
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
        {
          until: until.format(DATETIME),
        },
      )
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

      const claim = await this.appointmentRepository
        .createQueryBuilder()
        .update(AppointmentEntity)
        .set({ reminderSentAt: () => 'CURRENT_TIMESTAMP' })
        .where('id = :id', { id: appointment.id })
        .andWhere('reminder_sent_at IS NULL')
        .andWhere('status IN (:...statuses)', { statuses: REMINDABLE })
        .execute();
      if (claim.affected !== 1) {
        continue; // lo tomó otra ejecución, o cambió de estado recién
      }

      try {
        await this.eventEmitter.emitAsync(
          AppointmentEvents.REMINDER,
          toAppointmentEventPayload(appointment),
        );
      } catch (error) {
        // un canal que falla no frena al resto de los recordatorios
        appointmentsErrorLogger.error(
          `[AppointmentRemindersService] recordatorio del turno ${appointment.id} falló: ${error instanceof Error ? error.message : error}`,
        );
      }
      sent.push(appointment.id);
    }
    return sent;
  }
}
