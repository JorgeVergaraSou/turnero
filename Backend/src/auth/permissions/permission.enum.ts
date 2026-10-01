/**
 * Permisos del sistema, con formato `recurso:acción`. Se asignan a roles
 * en role-permissions.ts y se exigen por endpoint con
 * @RequirePermissions(...).
 *
 * Los permisos CLINICAL_* son los únicos que habilitan leer/escribir
 * información clínica. Tener un permiso clínico es condición necesaria
 * pero no suficiente: el service además verifica la relación del usuario
 * con el paciente/recurso (prevención de IDOR/BOLA).
 */
export enum Permission {
  // --- administrativos ---
  USERS_MANAGE = 'users:manage',
  PROFESSIONALS_MANAGE = 'professionals:manage',
  SPECIALTIES_MANAGE = 'specialties:manage',
  HEALTH_INSURANCES_MANAGE = 'health-insurances:manage',
  OFFICES_MANAGE = 'offices:manage',
  SCHEDULES_MANAGE = 'schedules:manage',
  SCHEDULES_READ = 'schedules:read',
  PATIENTS_READ = 'patients:read',
  PATIENTS_WRITE = 'patients:write',
  APPOINTMENTS_READ = 'appointments:read',
  APPOINTMENTS_MANAGE = 'appointments:manage',
  AUDIT_READ = 'audit:read',
  SETTINGS_MANAGE = 'settings:manage',
  /** administrar las pantallas de sala (tokens de dispositivo) */
  DISPLAYS_MANAGE = 'displays:manage',

  // --- agenda propia del profesional ---
  OWN_AGENDA_READ = 'own-agenda:read',
  CONSULTATIONS_ATTEND = 'consultations:attend',
  /** llamar a un paciente de la sala de espera */
  CALLS_MAKE = 'calls:make',

  // --- clínicos ---
  CLINICAL_READ = 'clinical:read',
  CLINICAL_WRITE = 'clinical:write',
}

/** clave de metadata donde @RequirePermissions(...) guarda los permisos
 * exigidos y PermissionsGuard los lee */
export const PERMISSIONS_KEY = 'permissions';
