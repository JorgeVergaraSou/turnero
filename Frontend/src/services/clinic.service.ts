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
  AdminPrivacyNotice,
  AttendanceConfirmation,
  WhatsAppReminder,
  PrivacyNotice,
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
  HistoryExport,
  HistoryExportScope,
  HistoryExportCandidate,
  HistoryExportInput,
  HistoryExportSummary,
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
  /** enlace "confirmo que voy" del recordatorio: qué turno es */
  attendanceInfo: (token: string) =>
    data<AttendanceConfirmation>(api.get('/public/appointments/confirm', { params: { t: token } })),
  confirmAttendance: (token: string) =>
    data<AttendanceConfirmation>(api.post('/public/appointments/confirm', { t: token })),
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
    /** versión del aviso de privacidad que la persona aceptó (obligatoria) */
    privacyVersion: number;
  }) => data<PublicAppointment>(api.post('/public/appointments', body)),
  privacyNotice: () => data<PrivacyNotice>(api.get('/public/privacy-notice')),
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
  privacyNotices: () => data<AdminPrivacyNotice[]>(api.get('/admin/privacy-notices')),
  publishPrivacyNotice: (body: { summary: string; policy: string; isDraft: boolean }) =>
    data<PrivacyNotice>(api.post('/admin/privacy-notices', body)),
  displayDevices: () => data<DisplayDevice[]>(api.get('/admin/display-devices')),
  createDisplayDevice: (name: string) =>
    data<DisplayDeviceWithToken>(api.post('/admin/display-devices', { name })),
  updateDisplayDevice: (id: number, body: { name?: string; active?: boolean }) =>
    data<DisplayDevice>(api.patch(`/admin/display-devices/${id}`, body)),
  /** vuelve a mostrar el token de una pantalla (queda auditado) */
  displayDeviceToken: (id: number) =>
    data<{ token: string }>(api.get(`/admin/display-devices/${id}/token`)),
  rotateDisplayDeviceToken: (id: number) =>
    data<DisplayDeviceWithToken>(api.post(`/admin/display-devices/${id}/rotate-token`)),
  auditLogs: (params: AuditQuery) =>
    data<Paginated<AuditLogItem>>(api.get('/admin/audit-logs', { params })),
  resetUserPassword: (id: number, password: string) =>
    api.post(`/auth/restablecer-clave/${id}`, { password }),
};

// ---------------- recepción ----------------

export const receptionApi = {
  /** avisos por WhatsApp que le tocan a recepción (se mandan a mano) */
  whatsappReminders: () => data<WhatsAppReminder[]>(api.get('/admin/whatsapp-reminders')),
  markWhatsappReminder: (appointmentId: number, stage: 1 | 2, outcome: 'SENT' | 'SKIPPED') =>
    data<{ marked: boolean }>(api.post(`/admin/whatsapp-reminders/${appointmentId}/${stage}/mark`, { outcome })),
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

// ---------------- copia de la historia clínica: recepción y administración ----------------

export const historyExportApi = {
  list: (scope: HistoryExportScope) =>
    data<HistoryExport[]>(api.get('/admin/history-exports', { params: { scope } })),
  summary: () => data<HistoryExportSummary>(api.get('/admin/history-exports/summary')),
  /** médicos que atendieron al paciente (los únicos que pueden emitir su copia) */
  candidates: (patientId: number) =>
    data<HistoryExportCandidate[]>(api.get('/admin/history-exports/candidates', { params: { patientId } })),
  create: (body: HistoryExportInput) => data<HistoryExport>(api.post('/admin/history-exports', body)),
  cancel: (id: number, reason: string) =>
    data<HistoryExport>(api.post(`/admin/history-exports/${id}/cancel`, { reason })),
  reassign: (id: number, professionalId: number) =>
    data<HistoryExport>(api.patch(`/admin/history-exports/${id}/reassign`, { professionalId })),
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

  // copias de la historia clínica pedidas por los pacientes
  historyExports: (scope: HistoryExportScope) =>
    data<HistoryExport[]>(api.get('/doctor/history-exports', { params: { scope } })),
  historyExportSummary: () => data<HistoryExportSummary>(api.get('/doctor/history-exports/summary')),
  /** genera el PDF (queda registrada la emisión); no se guarda en el servidor */
  issueHistoryExport: async (id: number) => {
    const res = await api.post(
      `/doctor/history-exports/${id}/issue`,
      { identityConfirmed: true },
      { responseType: 'blob' },
    );
    return res.data as Blob;
  },
  deliverHistoryExport: (id: number) =>
    data<HistoryExport>(api.post(`/doctor/history-exports/${id}/deliver`)),
};
