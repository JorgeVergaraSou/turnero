import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import moment from 'moment-timezone';
import {
  AppointmentEventPayload,
  AppointmentEvents,
} from '@/appointments/appointment.events';
import { getTransporter } from '@/config/mailer';
import { notificationsErrorLogger } from '@/config/module-loggers';
import { SettingsService } from '@/settings/settings.service';

/**
 * Aviso por email de los eventos de turnos. Es un canal más: WhatsApp/SMS
 * serían otros listeners de los mismos eventos, sin tocar AppointmentsService.
 *
 * Nunca rompe el flujo: si no hay SMTP configurado o el envío falla, se
 * loguea y listo — el turno ya quedó registrado y el paciente tiene su
 * código en pantalla. El mail solo lleva datos administrativos (nada
 * clínico).
 */
@Injectable()
export class AppointmentEmailListener {
  constructor(private readonly settingsService: SettingsService) {}

  @OnEvent(AppointmentEvents.CREATED, { async: true })
  onCreated(payload: AppointmentEventPayload) {
    return this.send(payload, 'Turno confirmado', 'Tu turno quedó reservado.');
  }

  @OnEvent(AppointmentEvents.RESCHEDULED, { async: true })
  onRescheduled(payload: AppointmentEventPayload) {
    return this.send(
      payload,
      'Turno reprogramado',
      'Tu turno cambió de fecha u horario. Estos son los nuevos datos:',
    );
  }

  @OnEvent(AppointmentEvents.REMINDER, { async: true })
  onReminder(payload: AppointmentEventPayload) {
    return this.send(
      payload,
      'Recordatorio de turno',
      'Te recordamos tu turno. Si no vas a poder asistir, cancelalo así el horario queda libre para otra persona.',
    );
  }

  @OnEvent(AppointmentEvents.CANCELLED, { async: true })
  onCancelled(payload: AppointmentEventPayload) {
    return this.send(payload, 'Turno cancelado', 'Tu turno fue cancelado.');
  }

  /** va al email del LEGAJO, no al de quien reservó (ver AppointmentsService) */
  @OnEvent(AppointmentEvents.IDENTITY_NOTICE, { async: true })
  onIdentityNotice(payload: AppointmentEventPayload) {
    return this.send(
      payload,
      'Se reservó un turno con tu DNI',
      'Se reservó un turno por la web con tu DNI, pero con datos de contacto distintos a los que tenemos registrados. Si fuiste vos, ignorá este mensaje. Si no fuiste vos, cancelalo desde la web con este código y tu DNI, y avisanos.',
    );
  }

  private async send(
    payload: AppointmentEventPayload,
    subject: string,
    intro: string,
  ): Promise<void> {
    if (!payload.contactEmail || !process.env.MAIL_USER) {
      return;
    }
    try {
      const settings = await this.settingsService.get();
      // MAIL_FROM_NAME (env) tiene prioridad si está; si no, el nombre configurado
      const fromName = process.env.MAIL_FROM_NAME || settings.clinicName;
      const when = `${moment(payload.date, 'YYYY-MM-DD').format('DD/MM/YYYY')} ${payload.startTime.slice(0, 5)}`;

      await getTransporter().sendMail({
        from: `"${fromName}" <${process.env.MAIL_USER}>`,
        to: payload.contactEmail,
        subject: `${subject} — código ${payload.code}`,
        html: `
          <p>Hola ${escapeHtml(payload.patientFirstName)},</p>
          <p>${intro}</p>
          <ul>
            <li><b>Código:</b> ${escapeHtml(payload.code)}</li>
            <li><b>Fecha y hora:</b> ${escapeHtml(when)}</li>
            <li><b>Profesional:</b> ${escapeHtml(payload.professionalName)}</li>
            <li><b>Especialidad:</b> ${escapeHtml(payload.specialtyName)}</li>
            <li><b>Consultorio:</b> ${escapeHtml(payload.officeName)} — ${escapeHtml(payload.officeAddress)}</li>
          </ul>
          <p>Con tu código y tu DNI podés consultar o cancelar el turno desde la web.</p>
          ${settings.contactPhone ? `<p>Consultas: ${escapeHtml(settings.contactPhone)}</p>` : ''}
        `,
      });
    } catch (error) {
      notificationsErrorLogger.error(
        `[AppointmentEmailListener] No se pudo enviar "${subject}" (turno ${payload.appointmentId}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

/** los datos del paciente vienen de un formulario público: nunca HTML crudo */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
