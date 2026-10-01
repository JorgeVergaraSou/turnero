import moment from 'moment-timezone';

/**
 * Zona horaria del consultorio. Todas las fechas/horas de agenda (turnos,
 * horarios, excepciones) se guardan como fecha (DATE, 'YYYY-MM-DD') y
 * hora local (TIME, 'HH:mm:ss') del consultorio — nunca como instantes
 * UTC — así "el turno del lunes 10:30" no se corre por conversiones de
 * zona horaria entre servidor, base y navegador.
 */
export const CLINIC_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Fecha y hora actuales en la zona del consultorio. */
export function clinicNow(): { date: string; time: string } {
  const now = moment().tz(CLINIC_TIMEZONE);
  return { date: now.format('YYYY-MM-DD'), time: now.format('HH:mm:ss') };
}

/** 'HH:mm' o 'HH:mm:ss' → minutos desde las 00:00. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** minutos desde las 00:00 → 'HH:mm:ss' (formato TIME de MySQL). */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

/** Normaliza 'HH:mm' a 'HH:mm:ss' (lo que devuelve MySQL para TIME). */
export function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

/** Día ISO de la semana de una fecha 'YYYY-MM-DD': 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  return moment.utc(date, 'YYYY-MM-DD', true).isoWeekday();
}

/** Suma días a una fecha 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  return moment
    .utc(date, 'YYYY-MM-DD', true)
    .add(days, 'days')
    .format('YYYY-MM-DD');
}

/** Cantidad de días entre dos fechas 'YYYY-MM-DD' (to - from). */
export function daysBetween(from: string, to: string): number {
  return moment
    .utc(to, 'YYYY-MM-DD', true)
    .diff(moment.utc(from, 'YYYY-MM-DD', true), 'days');
}

/** Minutos que faltan (negativo si ya pasó) hasta una fecha/hora local del consultorio. */
export function minutesUntil(date: string, time: string): number {
  const target = moment.tz(
    `${date} ${normalizeTime(time)}`,
    'YYYY-MM-DD HH:mm:ss',
    CLINIC_TIMEZONE,
  );
  return target.diff(moment().tz(CLINIC_TIMEZONE), 'minutes');
}

/** true si la fecha/hora dada ya pasó (o es exactamente ahora) en la zona del consultorio. */
export function isPast(date: string, time: string): boolean {
  const now = clinicNow();
  return (
    date < now.date || (date === now.date && normalizeTime(time) <= now.time)
  );
}
