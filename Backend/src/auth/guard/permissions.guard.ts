import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, Permission } from '../permissions/permission.enum';
import { roleHasPermissions } from '../permissions/role-permissions';

/**
 * Exige que el rol del usuario (tomado de la base por AuthGuard, no del
 * JWT) tenga todos los permisos declarados con @RequirePermissions(...).
 *
 * A diferencia de RolesGuard, NO deja pasar a ADMIN automáticamente — es
 * justamente lo que separa los permisos administrativos de los clínicos.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user?.role) {
      return false;
    }

    return roleHasPermissions(user.role, required);
  }
}
