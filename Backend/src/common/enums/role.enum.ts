/**
 * Roles del consultorio. Un usuario tiene un solo rol.
 *
 * El rol decide el acceso ADMINISTRATIVO (vía @Auth(...roles), donde ADMIN
 * pasa todos los checks). El acceso CLÍNICO no se decide por rol sino por
 * permisos explícitos (@RequirePermissions, ver
 * src/auth/permissions/role-permissions.ts), donde ADMIN NO tiene ningún
 * pase automático.
 *
 * MEDICO es el usuario (credenciales/acceso); los datos profesionales
 * (matrícula, especialidades, agenda) viven en una entidad Professional
 * separada, relacionada 1:1 con el usuario.
 */
export enum Role {
  ADMIN = 'ADMIN',
  RECEPCIONISTA = 'RECEPCIONISTA',
  MEDICO = 'MEDICO',
}
