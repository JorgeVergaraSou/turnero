/**
 * Tipos del dominio del consultorio, espejo de lo que devuelve el backend
 * (/api). Fechas 'YYYY-MM-DD' y horas 'HH:mm:ss', locales del consultorio.
 */

export type AppointmentStatus =
  | 'RESERVADO'
  | 'CONFIRMADO'
  | 'EN_ATENCION'
  | 'ATENDIDO'
  | 'CANCELADO'
  | 'AUSENTE';

/** Obra social / prepaga. "Particular" no es una fila: es null. */
export interface HealthInsurance {
  id: number;
  name: string;
  active?: boolean;
}

export interface Specialty {
  id: number;
  name: string;
  description: string | null;
  active?: boolean;
}

export interface Office {
  id: number;
  name: string;
  address: string;
  locationDetails: string | null;
  phone: string | null;
  active: boolean;
}

export interface SpecialtySummary {
  id: number;
  name: string;
}

export interface PublicProfessional {
  id: number;
  firstName: string;
  lastName: string;
  specialties: SpecialtySummary[];
}

export interface Professional extends PublicProfessional {
  userId: number;
  nickUsuario: string;
  licenseNumber: string;
  active: boolean;
  userActive: boolean;
}

export interface EligibleUser {
  idUser: number;
  nickUsuario: string;
  nombre: string;
  apellido: string;
}

export interface Schedule {
  id: number;
  professionalId: number;
  officeId: number;
  office?: Office;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
}

export type ScheduleExceptionType =
  | 'VACACIONES'
  | 'FERIADO'
  | 'LICENCIA'
  | 'AUSENCIA'
  | 'BLOQUEO'
  | 'REUNION'
  | 'HORARIO_ESPECIAL';

export interface ScheduleException {
  id: number;
  professionalId: number | null;
  type: ScheduleExceptionType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  officeId: number | null;
  slotMinutes: number | null;
  reason: string | null;
  active: boolean;
}

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  /** null = particular */
  healthInsuranceId: number | null;
  healthInsurance?: HealthInsurance | null;
  /** número de afiliado (null si es particular o no se cargó) */
  healthInsuranceNumber: string | null;
}

export interface PatientInput {
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone: string;
  email?: string;
  birthDate?: string;
  /** null = particular; undefined = todavía no eligió (el backend lo rechaza) */
  healthInsuranceId?: number | null;
  /** opcional; null lo borra */
  healthInsuranceNumber?: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Appointment {
  id: number;
  code: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  source: 'PUBLICO' | 'RECEPCION';
  /** lo que escribió quien reservó (puede diferir del legajo) */
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string | null;
  /** obra social declarada al reservar (null = particular) */
  contactHealthInsurance: { id: number; name: string | null } | null;
  /** número de afiliado declarado al reservar */
  contactHealthInsuranceNumber: string | null;
  /** reserva web con datos distintos al legajo: posible DNI ajeno */
  contactMismatch: ('name' | 'phone' | 'email' | 'healthInsurance' | 'healthInsuranceNumber')[];
  cancellationReason: string | null;
  patient: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'documentNumber' | 'phone' | 'email'> & {
    healthInsurance: { id: number; name: string | null } | null;
    healthInsuranceNumber: string | null;
  };
  professional: { id: number; firstName: string; lastName: string };
  specialty: SpecialtySummary;
  office: Pick<Office, 'id' | 'name' | 'address' | 'locationDetails'>;
}

/** Un llamado tal como sale por el stream hacia la pantalla de sala: solo
 * nombre, consultorio y hora (nunca datos personales ni clínicos). */
export interface DisplayCall {
  /** identifica el llamado (no se repite al reconectar) */
  key: string;
  callNumber: number;
  /** ya formateado por el servidor (completo, abreviado o código) */
  displayName: string;
  /** lo que dice la voz: igual a displayName salvo el código, que se deletrea */
  spokenName: string;
  officeName: string;
  calledAt: string;
  /** hora local del consultorio, 'HH:mm:ss' */
  calledTime: string;
}

/** Configuración que el servidor le manda a la pantalla (evento `config`). */
export interface DisplayConfig {
  enabled: boolean;
  voiceRepeats: number;
}

/** Respuesta de `POST doctor/appointments/:id/call`. */
export interface CallResult {
  /** 1 = primer llamado, 2 = "volver a llamar", … */
  callNumber: number;
  calledAt: string;
  officeName: string;
  /** llamados que todavía se pueden hacer a este turno */
  remainingCalls: number;
  /** segundos hasta poder volver a llamar */
  nextCallInSeconds: number;
}

export interface AppointmentHistoryEntry {
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  fromDate: string | null;
  fromStartTime: string | null;
  toDate: string | null;
  toStartTime: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AppointmentDetail extends Appointment {
  history: AppointmentHistoryEntry[];
}

/** Lo que ve el paciente (reserva / consulta con código + DNI). */
export interface PublicAppointment {
  code: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  patientName: string;
  professional: { firstName: string; lastName: string };
  specialty: string;
  office: {
    name: string;
    address: string;
    locationDetails: string | null;
    phone: string | null;
  };
}

// ---------------- clínico ----------------

export type DiagnosisType = 'PRINCIPAL' | 'SECUNDARIO';
export type StudyRequestType =
  | 'LABORATORIO'
  | 'RADIOGRAFIA'
  | 'ECOGRAFIA'
  | 'RESONANCIA'
  | 'OTRO';

export interface Diagnosis {
  id?: number;
  type: DiagnosisType;
  description: string;
  codeSystem?: string | null;
  code?: string | null;
}

export interface Medication {
  id?: number;
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
}

export interface StudyRequest {
  id?: number;
  type: StudyRequestType;
  description: string;
  notes?: string | null;
}

export interface VitalSigns {
  weightKg: number | null;
  heightCm: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  temperatureC: number | null;
  oxygenSaturation: number | null;
}

export interface Amendment {
  id: number;
  authorUserId: number;
  content: string;
  reason: string;
  createdAt: string;
}

export interface Consultation {
  id: number;
  appointmentId: number;
  patientId: number;
  status: 'BORRADOR' | 'FINALIZADA';
  professional: {
    id: number;
    firstName: string;
    lastName: string;
    specialties: string[];
  };
  reason: string | null;
  anamnesis: string | null;
  physicalExam: string | null;
  evolution: string | null;
  indications: string | null;
  observations: string | null;
  vitalSigns: VitalSigns;
  diagnoses: Diagnosis[];
  medications: Medication[];
  studyRequests: StudyRequest[];
  amendments: Amendment[];
  startedAt: string;
  finalizedAt: string | null;
  finalizedByUserId: number | null;
  contentHash: string | null;
}

export type ConsultationUpdate = Partial<
  Pick<
    Consultation,
    'reason' | 'anamnesis' | 'physicalExam' | 'evolution' | 'indications' | 'observations'
  >
> &
  Partial<VitalSigns> & {
    diagnoses?: Diagnosis[];
    medications?: Medication[];
    studyRequests?: StudyRequest[];
  };

export interface DoctorProfile {
  id: number;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialties: SpecialtySummary[];
}

export interface DoctorDashboard {
  date: string;
  now: { date: string; time: string };
  counts: {
    total: number;
    pending: number;
    inAttention: number;
    attended: number;
    cancelled: number;
    noShow: number;
  };
  appointments: Appointment[];
}

export interface StaffUser {
  idUser: number;
  nickUsuario: string;
  nombre: string;
  apellido: string;
  email: string | null;
  role: string;
  deletedAt: string | null;
  /** bloqueado por intentos fallidos hasta esta hora (null = no) */
  lockedUntil: string | null;
  /** tiene configurada la verificación en dos pasos */
  twoFactorEnabled: boolean;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  clinical: boolean;
  result: 'SUCCESS' | 'DENIED';
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  actor: { id: number; name: string; nickUsuario: string; role: string } | null;
  patient: { id: number; name: string | null; documentNumber: string | null } | null;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  category?: 'CLINICAL' | 'ACCESS' | 'ADMINISTRATIVE';
  result?: 'SUCCESS' | 'DENIED';
  patientId?: number;
  page?: number;
}

/** Configuración del consultorio (GET public/settings, PATCH admin/settings). */
export interface ClinicSettings {
  clinicName: string;
  contactPhone: string | null;
  publicBookingEnabled: boolean;
  bookingHorizonDays: number;
  publicCancelMinHours: number;
  /** si es false, el médico no puede llamar pacientes (se oculta el botón) */
  callsEnabled: boolean;
}

/** Configuración completa (solo admin): lo público + lo interno. */
export interface AdminClinicSettings extends ClinicSettings {
  /** horas antes del turno en que se manda el recordatorio (0 = no se mandan) */
  reminderHoursBefore: number;
  /** turnos pendientes por DNI reservando por la web (0 = sin tope) */
  publicMaxPendingPerPatient: number;
  /** roles obligados a usar verificación en dos pasos */
  twoFactorRoles: ('ADMIN' | 'RECEPCIONISTA' | 'MEDICO')[];
  /** cómo se nombra al paciente en la pantalla y la voz */
  callNameFormat: CallNameFormat;
  /** cuántas veces repite la voz cada llamado (1 a 3) */
  callVoiceRepeats: number;
}

export type CallNameFormat = 'FULL' | 'ABBREVIATED' | 'CODE';

/** Pantalla de sala (TV) tal como la ve el administrador: nunca trae el token. */
export interface DisplayDevice {
  id: number;
  name: string;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

/** Solo al crear o cambiar el token: se muestra una vez y no se puede volver a ver. */
export interface DisplayDeviceWithToken extends DisplayDevice {
  token: string;
}
