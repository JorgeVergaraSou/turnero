import { Role } from '@/common/enums/role.enum';
import { Permission } from './permission.enum';

/**
 * Única fuente de verdad de qué puede hacer cada rol.
 *
 * ADMIN no tiene ningún permiso clínico a propósito: administrar el
 * consultorio no implica poder leer historias clínicas. Si algún día hace
 * falta acceso clínico administrativo (ej. un auditor médico), se agrega
 * un rol nuevo con los permisos CLINICAL_* explícitos — nunca se le suman
 * a ADMIN "porque es admin".
 *
 * A diferencia de @Auth(...roles) (RolesGuard deja pasar a ADMIN en todo),
 * @RequirePermissions(...) no tiene ningún pase automático: lo que no está
 * en esta tabla, no se puede.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.ADMIN]: [
    Permission.USERS_MANAGE,
    Permission.PROFESSIONALS_MANAGE,
    Permission.SPECIALTIES_MANAGE,
    Permission.HEALTH_INSURANCES_MANAGE,
    Permission.OFFICES_MANAGE,
    Permission.SCHEDULES_MANAGE,
    Permission.SCHEDULES_READ,
    Permission.PATIENTS_READ,
    Permission.PATIENTS_WRITE,
    Permission.APPOINTMENTS_READ,
    Permission.APPOINTMENTS_MANAGE,
    Permission.AUDIT_READ,
    Permission.SETTINGS_MANAGE,
    Permission.DISPLAYS_MANAGE,
  ],
  [Role.RECEPCIONISTA]: [
    Permission.SCHEDULES_READ,
    Permission.PATIENTS_READ,
    Permission.PATIENTS_WRITE,
    Permission.APPOINTMENTS_READ,
    Permission.APPOINTMENTS_MANAGE,
  ],
  [Role.MEDICO]: [
    Permission.OWN_AGENDA_READ,
    Permission.CONSULTATIONS_ATTEND,
    Permission.CALLS_MAKE,
    Permission.CLINICAL_READ,
    Permission.CLINICAL_WRITE,
  ],
};

/** true si el rol tiene TODOS los permisos pedidos. Un rol desconocido
 * (ej. un valor viejo que quedó en la base) no tiene ninguno. */
export function roleHasPermissions(
  role: string,
  required: readonly Permission[],
): boolean {
  const granted = ROLE_PERMISSIONS[role as Role];
  if (!granted) {
    return false;
  }
  return required.every((permission) => granted.includes(permission));
}
