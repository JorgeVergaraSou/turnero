import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '@/common/enums/role.enum';

function buildContext(role: Role): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite pasar si la ruta no tiene @Roles(...)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(buildContext(Role.MEDICO))).toBe(true);
  });

  it('un ADMIN siempre pasa, sea cual sea el rol requerido', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.RECEPCIONISTA]);

    expect(guard.canActivate(buildContext(Role.ADMIN))).toBe(true);
  });

  it('deja pasar a un RECEPCIONISTA cuando @Auth(Role.RECEPCIONISTA, Role.MEDICO) lo incluye', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.RECEPCIONISTA, Role.MEDICO]);

    expect(guard.canActivate(buildContext(Role.RECEPCIONISTA))).toBe(true);
  });

  it('deja pasar a un MEDICO cuando @Auth(Role.RECEPCIONISTA, Role.MEDICO) lo incluye', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.RECEPCIONISTA, Role.MEDICO]);

    expect(guard.canActivate(buildContext(Role.MEDICO))).toBe(true);
  });

  it('rechaza un rol que no está en la lista requerida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(buildContext(Role.MEDICO))).toBe(false);
  });
});
