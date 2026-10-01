//src/services/clinic.service.ts
/**
 * Servicios del consultorio. Todos vía `api` (token agregado por el
 * interceptor). Agrupados por área: público (sin cuenta), administración,
 * recepción y panel médico.
 */
import { api } from '@/api/axios';
import {
  Appointment,
  CallResult,
  DisplayDevice,
  DisplayDeviceWithToken,
  AuditLogItem,
  AuditQuery,
  AdminClinicSettings,
  ClinicSettings,
  AppointmentDetail,
  AppointmentStatus,
  Consultation,
  ConsultationUpdate,
  DoctorDashboard,
  DoctorProfile,
  EligibleUser,
  Office,
  Paginated,
  Patient,
  PatientInput,
  Professional,
  PublicAppointment,
  PublicProfessional,
  Schedule,
  ScheduleException,
  Slot,
  Specialty,
  StaffUser,
  HealthInsurance,
} from '@/interfaces';

const data = <T>(promise: Promise<{ data: T }>) => promise.then((res) => res.data);

// ---------------- público (paciente sin cuenta) ----------------

export const publicApi = {
  settings: () => data<ClinicSettings>(api.get('/public/settings')),
  specialties: () => data<Specialty[]>(api.get('/public/specialties')),
  healthInsurances: () => data<HealthInsurance[]>(api.get('/public/health-insurances')),
  professionals: (specialtyId: number) =>
    data<PublicProfessional[]>(api.get('/public/professionals', { params: { specialtyId } })),
  availability: (professionalId: number, from: string, to: string) =>
    data<Slot[]>(
      api.get(`/public/professionals/${professionalId}/availability`, { params: { from, to } }),
    ),
  book: (body: {
    professionalId: number;
    specialtyId: number;
    date: string;
    startTime: string;
    patient: PatientInput;
  }) => data<PublicAppointment>(api.post('/public/appointments', body)),
  lookup: (code: string, documentNumber: string) =>
    data<PublicAppointment>(api.post('/public/appointments/lookup', { code, documentNumber })),
  cancel: (code: string, documentNumber: string) =>
    data<PublicAppointment>(api.post('/public/appointments/cancel', { code, documentNumber })),
};

// ---------------- administración ----------------

export const adminApi = {
  specialties: () => data<Specialty[]>(api.get('/admin/specialties')),
  createSpecialty: (body: { name: string; description?: string }) =>
    data<Specialty>(api.post('/admin/specialties', body)),
  updateSpecialty: (id: number, body: Partial<Specialty>) =>
    data<Specialty>(api.patch(`/admin/specialties/${id}`, body)),

  healthInsurances: () => data<HealthInsurance[]>(api.get('/admin/health-insurances')),
  createHealthInsurance: (body: { name: string }) =>
    data<HealthInsurance>(api.post('/admin/health-insurances', body)),
  updateHealthInsurance: (id: number, body: Partial<HealthInsurance>) =>
    data<HealthInsurance>(api.patch(`/admin/health-insurances/${id}`, body)),

  offices: () => data<Office[]>(api.get('/admin/offices')),
  createOffice: (body: Partial<Office>) => data<Office>(api.post('/admin/offices', body)),
  updateOffice: (id: number, body: Partial<Office>) =>
    data<Office>(api.patch(`/admin/offices/${id}`, body)),

  professionals: () => data<Professional[]>(api.get('/admin/professionals')),
  eligibleUsers: () => data<EligibleUser[]>(api.get('/admin/professionals/eligible-users')),
  createProfessional: (body: { userId: number; licenseNumber: string; specialtyIds: number[] }) =>
    data<Professional>(api.post('/admin/professionals', body)),
  updateProfessional: (
    id: number,
    body: { licenseNumber?: string; specialtyIds?: number[]; active?: boolean },
  ) => data<Professional>(api.patch(`/admin/professionals/${id}`, body)),

  schedules: (professionalId: number) =>
    data<Schedule[]>(api.get('/admin/schedules', { params: { professionalId } })),
  createSchedule: (body: Omit<Schedule, 'id' | 'active' | 'office' | 'validUntil'> & { validUntil?: string }) =>
    data<Schedule>(api.post('/admin/schedules', body)),
  updateSchedule: (id: number, body: Partial<Schedule>) =>
    data<Schedule>(api.patch(`/admin/schedules/${id}`, body)),

  exceptions: (params: { professionalId?: number; from?: string; to?: string }) =>
    data<ScheduleException[]>(api.get('/admin/schedule-exceptions', { params })),
  createException: (body: Record<string, unknown>) =>
    data<ScheduleException>(api.post('/admin/schedule-exceptions', body)),
  setExceptionActive: (id: number, active: boolean) =>
    data<ScheduleException>(api.patch(`/admin/schedule-exceptions/${id}`, { active })),

  users: () => data<StaffUser[]>(api.get('/auth/listar-usuarios')),
  deactivateUser: (id: number) => api.delete(`/auth/dar-de-baja-usuario/${id}`),
  activateUser: (id: number) => api.patch(`/auth/activar-usuario/${id}`),
  unlockUser: (id: number) => api.patch(`/auth/desbloquear-usuario/${id}`),
  resetTwoFactor: (id: number) => api.patch(`/auth/reiniciar-2fa/${id}`),
  updateUser: (
    id: number,
    body: { nombre?: string; apellido?: string; email?: string; role?: string },
  ) => api.patch(`/auth/editar-usuario/${id}`, body),
  settings: () => data<AdminClinicSettings>(api.get('/admin/settings')),
  updateSettings: (body: Partial<AdminClinicSettings>) =>
    data<AdminClinicSettings>(api.patch('/admin/settings', body)),
  displayDevices: () => data<DisplayDevice[]>(api.get('/admin/display-devices')),
  createDisplayDevice: (name: string) =>
    data<DisplayDeviceWithToken>(api.post('/admin/display-devices', { name })),
  updateDisplayDevice: (id: number, body: { name?: string; active?: boolean }) =>
    data<DisplayDevice>(api.patch(`/admin/display-devices/${id}`, body)),
  rotateDisplayDeviceToken: (id: number) =>
    data<DisplayDeviceWithToken>(api.post(`/admin/display-devices/${id}/rotate-token`)),
  auditLogs: (params: AuditQuery) =>
    data<Paginated<AuditLogItem>>(api.get('/admin/audit-logs', { params })),
  resetUserPassword: (id: number, password: string) =>
    api.post(`/auth/restablecer-clave/${id}`, { password }),
};

// ---------------- recepción ----------------

export const receptionApi = {
  /** todas, incluidas las desactivadas (para mostrar legajos viejos) */
  healthInsurances: () => data<HealthInsurance[]>(api.get('/admin/health-insurances')),
  searchPatients: (q: string, page = 1) =>
    data<Paginated<Patient>>(api.get('/admin/patients', { params: { q, page, limit: 20 } })),
  patient: (id: number) => data<Patient>(api.get(`/admin/patients/${id}`)),
  createPatient: (body: PatientInput) => data<Patient>(api.post('/admin/patients', body)),
  updatePatient: (id: number, body: Partial<PatientInput>) =>
    data<Patient>(api.patch(`/admin/patients/${id}`, body)),

  appointments: (params: {
    from?: string;
    to?: string;
    professionalId?: number;
    patientId?: number;
    status?: AppointmentStatus;
  }) => data<Appointment[]>(api.get('/admin/appointments', { params })),
  appointment: (id: number) => data<AppointmentDetail>(api.get(`/admin/appointments/${id}`)),
  book: (body: {
    professionalId: number;
    specialtyId: number;
    patientId: number;
    date: string;
    startTime: string;
  }) => data<Appointment>(api.post('/admin/appointments', body)),
  confirm: (id: number) => data<Appointment>(api.post(`/admin/appointments/${id}/confirm`)),
  cancel: (id: number, reason: string) =>
    data<Appointment>(api.post(`/admin/appointments/${id}/cancel`, { reason })),
  noShow: (id: number) => data<Appointment>(api.post(`/admin/appointments/${id}/no-show`)),
  reschedule: (id: number, body: { date: string; startTime: string; reason?: string }) =>
    data<Appointment>(api.patch(`/admin/appointments/${id}/reschedule`, body)),
};

// ---------------- panel médico ----------------

export const doctorApi = {
  me: () => data<DoctorProfile>(api.get('/doctor/me')),
  /** llama (o vuelve a llamar) a un paciente en sala de espera */
  call: (appointmentId: number) =>
    data<CallResult>(api.post(`/doctor/appointments/${appointmentId}/call`)),
  dashboard: (date?: string) =>
    data<DoctorDashboard>(api.get('/doctor/dashboard', { params: { date } })),
  appointments: (from: string, to: string) =>
    data<Appointment[]>(api.get('/doctor/appointments', { params: { from, to } })),
  patients: (q?: string) =>
    data<Pick<Patient, 'id' | 'firstName' | 'lastName' | 'documentNumber' | 'birthDate'>[]>(
      api.get('/doctor/patients', { params: { q } }),
    ),
  patient: (id: number) => data<Patient>(api.get(`/doctor/patients/${id}`)),
  history: (patientId: number, page = 1, limit = 10) =>
    data<Paginated<Consultation>>(
      api.get(`/doctor/patients/${patientId}/clinical-history`, { params: { page, limit } }),
    ),
  start: (appointmentId: number) =>
    data<Consultation>(api.post(`/doctor/appointments/${appointmentId}/start`)),
  consultationOfAppointment: (appointmentId: number) =>
    data<Consultation>(api.get(`/doctor/appointments/${appointmentId}/consultation`)),
  saveDraft: (id: number, body: ConsultationUpdate) =>
    data<Consultation>(api.patch(`/doctor/consultations/${id}`, body)),
  finalize: (id: number) => data<Consultation>(api.post(`/doctor/consultations/${id}/finalize`)),
  amend: (id: number, body: { content: string; reason: string }) =>
    data<Consultation>(api.post(`/doctor/consultations/${id}/amendments`, body)),
};
