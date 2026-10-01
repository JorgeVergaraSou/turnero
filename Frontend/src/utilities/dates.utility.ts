/**
 * Fechas de agenda: el backend trabaja con 'YYYY-MM-DD' y 'HH:mm:ss'
 * LOCALES del consultorio. Acá nunca se convierten a instantes UTC: se
 * arman como fecha local solo para formatear, así un turno del lunes
 * 10:30 se muestra lunes 10:30 sin importar la zona del navegador.
 */
export const CLINIC_TIMEZONE = 'America/Argentina/Buenos_Aires';

const toLocalDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const pad = (n: number) => String(n).padStart(2, '0');

const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Hoy en la zona del consultorio. */
export function clinicToday(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE }).format(new Date());
}

/** Hora actual 'HH:mm:ss' en la zona del consultorio. */
export function clinicTime(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

/** true si el turno ya empezó (fecha + hora locales del consultorio). */
export function hasStarted(date: string, startTime: string): boolean {
  const today = clinicToday();
  return date < today || (date === today && startTime <= clinicTime());
}

/** Minutos que faltan (negativo si ya pasó) hasta una fecha/hora local del consultorio. */
export function minutesUntil(date: string, startTime: string): number {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dayDiff = Math.round(
    (toLocalDate(date).getTime() - toLocalDate(clinicToday()).getTime()) / 86_400_000,
  );
  return dayDiff * 1440 + toMinutes(startTime) - toMinutes(clinicTime());
}

export function addDays(date: string, days: number): string {
  const d = toLocalDate(date);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Columna de la fecha en un calendario que empieza en lunes: 0 = lunes … 6 = domingo. */
export function mondayIndex(date: string): number {
  return (toLocalDate(date).getDay() + 6) % 7;
}

/** Todas las fechas de un rango, inclusive ('YYYY-MM-DD'). */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** 'HH:mm:ss' → 'HH:mm' */
export const shortTime = (time: string) => time.slice(0, 5);

/** 'lunes 5 de octubre' */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toLocalDate(date));
}

/** '05/10/2026' */
export function numericDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toLocalDate(date));
}

/** { weekday: 'lun', day: '5', month: 'oct' } para chips de calendario */
export function dateParts(date: string) {
  const d = toLocalDate(date);
  return {
    weekday: new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(d).replace('.', ''),
    day: String(d.getDate()),
    month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).replace('.', ''),
  };
}

/** Instante ISO (createdAt, finalizedAt) → '05/10/2026 10:45' en hora del consultorio. */
export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: CLINIC_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Edad en años a partir de 'YYYY-MM-DD'. */
export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = toLocalDate(clinicToday());
  const birth = toLocalDate(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];
