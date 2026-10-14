import { AppointmentEntity } from './entities/appointment.entity';

/**
 * Eventos de dominio de turnos. AppointmentsService los emite DESPUÉS de
 * confirmar la transacción; quién reacciona (hoy: mail de confirmación,
 * mañana: WhatsApp/SMS/recordatorios) se suscribe con @OnEvent sin que
 * los turnos sepan nada de canales de notificación.
 */
export const AppointmentEvents = {
  CREATED: 'appointment.created',
  CANCELLED: 'appointment.cancelled',
  RESCHEDULED: 'appointment.rescheduled',
  /** emitido por la tarea programada de recordatorios */
  REMINDER: 'appointment.reminder',
  /** reserva web con un DNI existente y datos de contacto distintos: se
   * avisa al email DEL LEGAJO (no al que escribió quien reservó) */
  IDENTITY_NOTICE: 'appointment.identity-notice',
  /** el médico llamó (o volvió a llamar) al paciente a su consultorio */
  CALLED: 'appointment.called',
  /** algo cambió en la agenda (reserva, llegada, cancelación, atención…): los
   * paneles abiertos se refrescan solos. Solo lleva ids, nada de datos personales */
  AGENDA_CHANGED: 'appointment.agenda-changed',
} as const;

/** Qué turno cambió, para que los paneles abiertos recarguen. */
export interface AgendaChangedPayload {
  appointmentId: number;
  professionalId: number;
  /** fecha del turno ('YYYY-MM-DD') */
  date: string;
}

/**
 * Payload del llamado. Lo consume la pantalla de sala: SOLO lo mínimo para
 * llamar a alguien (nombre, consultorio, hora). Nunca DNI, obra social,
 * especialidad, motivo ni datos clínicos.
 */
export interface AppointmentCalledPayload {
  appointmentId: number;
  /** código del turno: sirve para el formato "solo código" (Fase 6) */
  appointmentCode: string;
  callNumber: number;
  patientFirstName: string;
  patientLastName: string;
  officeName: string;
  /** instante del llamado (ISO 8601) */
  calledAt: string;
  /** hora local del consultorio, 'HH:mm:ss' */
  calledTime: string;
}

/** Solo datos administrativos necesarios para avisar al paciente. */
export interface AppointmentEventPayload {
  appointmentId: number;
  code: string;
  date: string;
  startTime: string;
  contactEmail: string | null;
  patientFirstName: string;
  professionalName: string;
  specialtyName: string;
  officeName: string;
  officeAddress: string;
}

/** Recordatorio: los datos del turno más la etapa y el enlace para confirmar. */
export interface AppointmentReminderPayload extends AppointmentEventPayload {
  /** 1 = primer aviso (datos del turno); 2 = último aviso, pide confirmar */
  stage: 1 | 2;
  /** enlace "confirmo que voy" (null si no hay FRONTEND_URL) */
  confirmUrl: string | null;
}

/** Arma el payload desde un turno con sus relaciones cargadas (paciente,
 * profesional + usuario, especialidad, consultorio). */
export function toAppointmentEventPayload(
  appointment: AppointmentEntity,
): AppointmentEventPayload {
  return {
    appointmentId: appointment.id,
    code: appointment.code,
    date: appointment.date,
    startTime: appointment.startTime,
    contactEmail: appointment.contactEmail,
    // el nombre que se escribió al reservar, no el del legajo (ver entity)
    patientFirstName: appointment.contactFirstName,
    professionalName: `${appointment.professional.user.nombre} ${appointment.professional.user.apellido}`,
    specialtyName: appointment.specialty.name,
    officeName: appointment.office.name,
    officeAddress: appointment.office.address,
  };
}
