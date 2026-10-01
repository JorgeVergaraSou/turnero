import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersAdminService } from './users-admin.service';
import { Role } from '@/common/enums/role.enum';

jest.mock('@/config/module-loggers', () => ({
  usersErrorLogger: { error: jest.fn() },
}));

const actor = { userId: 1, ip: null };

function build(overrides: {
  user?: Record<string, unknown>;
  otherActiveAdmins?: number;
  activeProfessionalProfile?: boolean;
}) {
  const userRepository = {
    findOne: jest.fn().mockResolvedValue({
      idUser: 2,
      nombre: 'Ana',
      apellido: 'Pérez',
      email: null,
      role: Role.ADMIN,
      deletedAt: null,
      ...overrides.user,
    }),
    count: jest.fn().mockResolvedValue(overrides.otherActiveAdmins ?? 1),
    exists: jest.fn().mockResolvedValue(false),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const professionalRepository = {
    exists: jest
      .fn()
      .mockResolvedValue(overrides.activeProfessionalProfile ?? false),
  };
  const usersService = {
    darDeBajaUsuario: jest.fn(),
    activarUsuario: jest.fn(),
  };
  const auditService = { record: jest.fn() };
  const service = new UsersAdminService(
    userRepository as any,
    professionalRepository as any,
    usersService as any,
    auditService as any,
  );
  return { service, userRepository, usersService, auditService };
}

describe('UsersAdminService', () => {
  it('no permite degradar al último ADMIN activo', async () => {
    const { service, userRepository } = build({ otherActiveAdmins: 0 });

    await expect(
      service.update(2, { role: Role.RECEPCIONISTA }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('no permite dar de baja al último ADMIN activo', async () => {
    const { service, usersService } = build({ otherActiveAdmins: 0 });

    await expect(service.deactivate(2, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersService.darDeBajaUsuario).not.toHaveBeenCalled();
  });

  it('permite degradar a un ADMIN si quedan otros activos, y lo audita', async () => {
    const { service, userRepository, auditService } = build({
      otherActiveAdmins: 2,
    });

    await service.update(2, { role: Role.RECEPCIONISTA }, actor);

    expect(userRepository.update).toHaveBeenCalledWith(2, {
      role: Role.RECEPCIONISTA,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          fromRole: Role.ADMIN,
          toRole: Role.RECEPCIONISTA,
        }),
      }),
    );
  });

  it('un admin no puede cambiarse su propio rol', async () => {
    const { service } = build({ user: { idUser: 1 } });

    await expect(
      service.update(1, { role: Role.MEDICO }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un admin no puede darse de baja a sí mismo', async () => {
    const { service } = build({});

    await expect(service.deactivate(1, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('un MEDICO con perfil profesional activo no puede perder el rol', async () => {
    const { service, userRepository } = build({
      user: { role: Role.MEDICO },
      activeProfessionalProfile: true,
    });

    await expect(
      service.update(2, { role: Role.RECEPCIONISTA }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('restablecer clave guarda un hash (nunca la clave) y limpia el token de recuperación', async () => {
    const { service, userRepository } = build({ user: { role: Role.MEDICO } });

    await service.resetPassword(2, 'NuevaClave1', actor);

    const [, changes] = userRepository.update.mock.calls[0];
    expect(changes.password).not.toBe('NuevaClave1');
    expect(changes.password).toMatch(/^\$argon2/);
    expect(changes.resetPasswordToken).toBeNull();
  });
});
