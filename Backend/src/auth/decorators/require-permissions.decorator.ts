import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { PERMISSIONS_KEY, Permission } from '../permissions/permission.enum';
import { AuthGuard } from '../guard/auth.guard';
import { PermissionsGuard } from '../guard/permissions.guard';

/**
 * Equivalente a @Auth(...roles) pero por permisos: exige un JWT válido de
 * un usuario activo (AuthGuard) cuyo rol tenga TODOS los permisos pedidos
 * (PermissionsGuard). Sin pase automático para ADMIN — usar este
 * decorador (no @Auth) en todo endpoint clínico.
 *
 * Igual que @Auth, repite AuthGuard aunque ya corra global: si algún día se
 * saca el APP_GUARD, estos endpoints no quedan abiertos.
 */
export function RequirePermissions(...permissions: Permission[]) {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    UseGuards(AuthGuard, PermissionsGuard),
  );
}
