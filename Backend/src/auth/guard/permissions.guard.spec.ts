import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { Role } from '@/common/enums/role.enum';
import { Permission } from '../permissions/permission.enum';

function buildContext(user?: { role: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  const requirePermissions = (...permissions: Permission[]) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('permite pasar si la ruta no declara permisos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(buildContext({ role: Role.MEDICO }))).toBe(true);
  });

  it('un MEDICO puede leer información clínica', () => {
    requirePermissions(Permission.CLINICAL_READ);

    expect(guard.canActivate(buildContext({ role: Role.MEDICO }))).toBe(true);
  });

  it('un ADMIN NO puede leer información clínica (sin pase automático)', () => {
    requirePermissions(Permission.CLINICAL_READ);

    expect(guard.canActivate(buildContext({ role: Role.ADMIN }))).toBe(false);
  });

  it('un ADMIN NO puede escribir información clínica', () => {
    requirePermissions(Permission.CLINICAL_WRITE);

    expect(guard.canActivate(buildContext({ role: Role.ADMIN }))).toBe(false);
  });

  it('un RECEPCIONISTA NO puede leer ni escribir información clínica', () => {
    requirePermissions(Permission.CLINICAL_READ);
    expect(guard.canActivate(buildContext({ role: Role.RECEPCIONISTA }))).toBe(
      false,
    );

    requirePermissions(Permission.CLINICAL_WRITE);
    expect(guard.canActivate(buildContext({ role: Role.RECEPCIONISTA }))).toBe(
      false,
    );
  });

  it('un RECEPCIONISTA puede gestionar turnos y pacientes', () => {
    requirePermissions(
      Permission.APPOINTMENTS_MANAGE,
      Permission.PATIENTS_WRITE,
    );

    expect(guard.canActivate(buildContext({ role: Role.RECEPCIONISTA }))).toBe(
      true,
    );
  });

  it('un MEDICO NO puede gestionar la configuración administrativa', () => {
    requirePermissions(Permission.SCHEDULES_MANAGE);

    expect(guard.canActivate(buildContext({ role: Role.MEDICO }))).toBe(false);
  });

  it('exige TODOS los permisos pedidos, no alcanza con uno', () => {
    requirePermissions(Permission.CLINICAL_READ, Permission.USERS_MANAGE);

    expect(guard.canActivate(buildContext({ role: Role.MEDICO }))).toBe(false);
    expect(guard.canActivate(buildContext({ role: Role.ADMIN }))).toBe(false);
  });

  it('rechaza un rol desconocido (ej. un valor viejo como USER)', () => {
    requirePermissions(Permission.PATIENTS_READ);

    expect(guard.canActivate(buildContext({ role: 'USER' }))).toBe(false);
  });

  it('rechaza si no hay usuario en el request', () => {
    requirePermissions(Permission.PATIENTS_READ);

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
