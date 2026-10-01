/**
 * Estados de un turno (reserva). REPROGRAMADO no es un estado: reprogramar
 * es un evento — el turno cambia de fecha/hora, conserva su código, vuelve
 * a RESERVADO y el cambio queda en appointment_status_history.
 */
export enum AppointmentStatus {
  RESERVADO = 'RESERVADO',
  /** recepción confirmó la asistencia (llegó / confirmó por teléfono) */
  CONFIRMADO = 'CONFIRMADO',
  EN_ATENCION = 'EN_ATENCION',
  ATENDIDO = 'ATENDIDO',
  CANCELADO = 'CANCELADO',
  AUSENTE = 'AUSENTE',
}

export enum AppointmentSource {
  PUBLICO = 'PUBLICO',
  RECEPCION = 'RECEPCION',
}

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  [AppointmentStatus.RESERVADO]: [
    AppointmentStatus.CONFIRMADO,
    AppointmentStatus.CANCELADO,
    AppointmentStatus.AUSENTE,
    AppointmentStatus.EN_ATENCION,
  ],
  [AppointmentStatus.CONFIRMADO]: [
    AppointmentStatus.CANCELADO,
    AppointmentStatus.AUSENTE,
    AppointmentStatus.EN_ATENCION,
  ],
  [AppointmentStatus.EN_ATENCION]: [AppointmentStatus.ATENDIDO],
  [AppointmentStatus.ATENDIDO]: [],
  [AppointmentStatus.CANCELADO]: [],
  [AppointmentStatus.AUSENTE]: [],
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Estados en los que el turno todavía se puede reprogramar/cancelar. */
export const PENDING_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.RESERVADO,
  AppointmentStatus.CONFIRMADO,
];
