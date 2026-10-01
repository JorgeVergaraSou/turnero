/** Duraciones de turno permitidas, en minutos. */
export const ALLOWED_SLOT_MINUTES = [15, 20, 30, 45, 60] as const;

export enum ScheduleExceptionType {
  VACACIONES = 'VACACIONES',
  FERIADO = 'FERIADO',
  LICENCIA = 'LICENCIA',
  AUSENCIA = 'AUSENCIA',
  BLOQUEO = 'BLOQUEO',
  REUNION = 'REUNION',
  /** único tipo que AGREGA disponibilidad (ej. un sábado puntual) */
  HORARIO_ESPECIAL = 'HORARIO_ESPECIAL',
}

/** Máximo rango de fechas por consulta de disponibilidad. */
export const MAX_AVAILABILITY_RANGE_DAYS = 31;
