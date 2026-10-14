import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import moment from 'moment-timezone';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status';
import { signConfirmToken } from './appointment-confirm-token.util';
import {
  buildWhatsAppMessage,
  toWhatsAppNumber,
  whatsAppUrl,
} from './whatsapp.util';
import { SettingsService } from '@/settings/settings.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { CLINIC_TIMEZONE } from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { appointmentsErrorLogger } from '@/config/module-loggers';

const DATETIME = 'YYYY-MM-DD HH:mm:ss';
const MAX_ITEMS = 200;

export type WhatsAppStage = 1 | 2;
export type WhatsAppOutcome = 'SENT' | 'SKIPPED';

/** Un aviso que le toca mandar a recepción. Solo datos administrativos. */
export interface WhatsAppReminderItem {
  appointmentId: number;
  stage: WhatsAppStage;
  firstName: string;
  lastName: string;
  date: string;
  startTime: string;
  /** como lo escribió el paciente (para llamarlo si no tiene WhatsApp) */
  phone: string;
  /** enlace wa.me con el mensaje armado; null si el teléfono no sirve para WhatsApp */
  whatsappUrl: string | null;
  /** el texto que se va a mandar (para mostrarlo antes de abrir el chat) */
  message: string;
}

/**
 * Avisos por WhatsApp para hacer a mano. Usa las MISMAS ventanas que los
 * recordatorios por mail (1.ª y 2.ª etapa, configurables), pero con su propio
 * registro de "ya avisado": recepción abre el chat con el mensaje armado y lo
 * marca como enviado. No sale para pacientes que ya avisaron que vienen, ya
 * llegaron o cancelaron, ni para quien reservó dentro de la ventana.
 */
@Injectable()
export class WhatsAppRemindersService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointments: Repository<AppointmentEntity>,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  /** Avisos pendientes ahora, el turno más próximo primero. */
  async listDue(): Promise<WhatsAppReminderItem[]> {
    const settings = await this.settingsService.get();
    const first = settings.reminderHoursBefore;
    const second = settings.secondReminderHoursBefore;
    const now = moment().tz(CLINIC_TIMEZONE);
    const items: WhatsAppReminderItem[] = [];

    if (second > 0) {
      items.push(...(await this.collect(2, second, null, now, settings)));
    }
    if (first > 0) {
      items.push(
        ...(await this.collect(
          1,
          first,
          second > 0 ? second : null,
          now,
          settings,
        )),
      );
    }
    return items
      .sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      )
      .slice(0, MAX_ITEMS);
  }

  /**
   * Recepción abrió el chat (o decidió no avisar): se registra para que no
   * vuelva a aparecer. Idempotente: marcar dos veces no falla ni duplica.
   */
  async mark(
    appointmentId: number,
    stage: WhatsAppStage,
    outcome: WhatsAppOutcome,
    actor: Actor,
  ): Promise<{ marked: boolean }> {
    try {
      const appointment = await this.appointments.findOneBy({
        id: appointmentId,
      });
      if (!appointment) throw new NotFoundException('Turno no encontrado');
      const column = stage === 1 ? 'whatsapp1_sent_at' : 'whatsapp2_sent_at';
      const claim = await this.appointments
        .createQueryBuilder()
        .update(AppointmentEntity)
        .set({
          [stage === 1 ? 'whatsapp1SentAt' : 'whatsapp2SentAt']: () =>
            'CURRENT_TIMESTAMP',
        })
        .where('id = :id', { id: appointmentId })
        .andWhere(`${column} IS NULL`)
        .execute();
      if (claim.affected === 1) {
        await this.auditService.record({
          actor,
          action: AuditAction.WHATSAPP_REMINDER_MARK,
          resourceType: 'appointment',
          resourceId: appointmentId,
          patientId: appointment.patientId,
          metadata: { stage, outcome },
        });
      }
      return { marked: claim.affected === 1 };
    } catch (error) {
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'WhatsAppRemindersService.mark',
        'Error al registrar el aviso por WhatsApp',
        { appointmentId, stage },
      );
    }
  }

  private async collect(
    stage: WhatsAppStage,
    hours: number,
    /** ventana de la 2.ª (solo para la 1.ª): lo que ya está adentro le toca a la 2.ª */
    excludeWithinHours: number | null,
    now: moment.Moment,
    settings: { clinicName: string },
  ): Promise<WhatsAppReminderItem[]> {
    const until = now.clone().add(hours, 'hours');
    const sentColumn = stage === 1 ? 'whatsapp1SentAt' : 'whatsapp2SentAt';
    const query = this.appointments
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.office', 'office')
      // un paciente que ya llegó (CONFIRMADO) o canceló no necesita aviso
      .where('appointment.status = :status', {
        status: AppointmentStatus.RESERVADO,
      })
      .andWhere(`appointment.${sentColumn} IS NULL`)
      // si ya avisó que viene, no hace falta recordárselo
      .andWhere('appointment.patientConfirmedAt IS NULL')
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
    if (excludeWithinHours !== null) {
      query.andWhere(
        'TIMESTAMP(appointment.date, appointment.startTime) > :secondUntil',
        {
          secondUntil: now
            .clone()
            .add(excludeWithinHours, 'hours')
            .format(DATETIME),
        },
      );
    }
    const rows = await query
      .orderBy('appointment.date', 'ASC')
      .addOrderBy('appointment.startTime', 'ASC')
      .take(MAX_ITEMS)
      .getMany();

    const today = now.format('YYYY-MM-DD');
    const items: WhatsAppReminderItem[] = [];
    for (const a of rows) {
      const start = moment.tz(
        `${a.date} ${a.startTime}`,
        DATETIME,
        CLINIC_TIMEZONE,
      );
      // reservado dentro de la ventana: ya tiene su confirmación
      if (moment(a.createdAt).isAfter(start.clone().subtract(hours, 'hours'))) {
        continue;
      }
      const message = buildWhatsAppMessage({
        stage,
        firstName: a.contactFirstName,
        clinicName: settings.clinicName,
        date: a.date,
        startTime: a.startTime,
        officeName: a.office.name,
        confirmUrl: this.confirmUrl(a),
        today,
      });
      const number = toWhatsAppNumber(a.contactPhone);
      items.push({
        appointmentId: a.id,
        stage,
        firstName: a.contactFirstName,
        lastName: a.contactLastName,
        date: a.date,
        startTime: a.startTime,
        phone: a.contactPhone,
        whatsappUrl: number ? whatsAppUrl(number, message) : null,
        message,
      });
    }
    return items;
  }

  private confirmUrl(a: AppointmentEntity): string | null {
    const base = process.env.FRONTEND_URL?.replace(/\/+$/, '');
    return base
      ? `${base}/confirmar?t=${signConfirmToken(a.id, a.code)}`
      : null;
  }
}
