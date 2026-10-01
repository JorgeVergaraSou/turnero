import { PublicRoutes, Roles, StaffPaths } from '@/models';

/** Pantalla de inicio de cada rol después del login. */
export const getRoleRoute = (role: Roles): string => {
  
  switch (role) {
    case Roles.ADMIN:
      return StaffPaths.ADMIN_HOME;
    case Roles.RECEPCIONISTA:
      return StaffPaths.RECEPTION_HOME;
    case Roles.MEDICO:
      return StaffPaths.DOCTOR_HOME;
    default:
      return `/${PublicRoutes.LOGIN}`;
  }
};
