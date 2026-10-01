import type {
  AppointmentStatus,
  Consultation,
  ScheduleExceptionType,
  StudyRequestType,
} from '@/interfaces';

/** Nombre del consultorio que ve el paciente. Configurable por .env. */
export const CLINIC_NAME: string = import.meta.env.VITE_CLINIC_NAME || 'Consultorio';

/** Agrupa el código del turno en dos bloques de 5 para dictarlo o copiarlo sin errores. */
export const formatCode = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`;

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  RESERVADO: 'Reservado',
  CONFIRMADO: 'Confirmado',
  EN_ATENCION: 'En atención',
  ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelado',
  AUSENTE: 'Ausente',
};

export const EXCEPTION_LABEL: Record<ScheduleExceptionType, string> = {
  VACACIONES: 'Vacaciones',
  FERIADO: 'Feriado',
  LICENCIA: 'Licencia',
  AUSENCIA: 'Ausencia',
  BLOQUEO: 'Bloqueo',
  REUNION: 'Reunión',
  HORARIO_ESPECIAL: 'Horario especial',
};

export const STUDY_LABEL: Record<StudyRequestType, string> = {
  LABORATORIO: 'Laboratorio',
  RADIOGRAFIA: 'Radiografía',
  ECOGRAFIA: 'Ecografía',
  RESONANCIA: 'Resonancia',
  OTRO: 'Otro',
};

/** Signos vitales cargados, listos para leer de corrido ("TA 120/80 mmHg", "FC 72 lpm"…). */
export function vitalsSummary(c: Consultation): string[] {
  const v = c.vitalSigns;
  const parts: string[] = [];
  if (v.systolicBp && v.diastolicBp) parts.push(`TA ${v.systolicBp}/${v.diastolicBp} mmHg`);
  if (v.heartRate) parts.push(`FC ${v.heartRate} lpm`);
  if (v.temperatureC) parts.push(`T ${v.temperatureC} °C`);
  if (v.oxygenSaturation) parts.push(`SatO₂ ${v.oxygenSaturation}%`);
  if (v.weightKg) parts.push(`Peso ${v.weightKg} kg`);
  if (v.heightCm) parts.push(`Talla ${v.heightCm} cm`);
  return parts;
}

/** Nombre para mostrar: null = particular. */
export const healthInsuranceLabel = (hi: { name: string | null } | null | undefined) =>
  hi ? (hi.name ?? 'Obra social') : 'Particular';

/** Mismo formato que acepta el backend para el número de afiliado. */
export const MEMBER_NUMBER_PATTERN = /^[A-Za-z0-9 ./-]{3,40}$/;

/** 'OSDE · N.º 61 123456 7/01' (o solo el nombre si no hay número). */
export const healthInsuranceWithNumber = (
  hi: { name: string | null } | null | undefined,
  number: string | null | undefined,
) => (hi && number ? `${healthInsuranceLabel(hi)} · N.º ${number}` : healthInsuranceLabel(hi));
