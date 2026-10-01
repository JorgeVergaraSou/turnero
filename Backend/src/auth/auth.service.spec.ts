import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '@/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@/common/enums/role.enum';
import { padToMinDuration } from '@/common/utils/timing-safe.util';
import { getTransporter } from '@/config/mailer';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { TwoFactorService } from './two-factor/two-factor.service';

let twoFactorService: { isRequired: jest.Mock; challenge: jest.Mock };
beforeEach(() => {
  twoFactorService = {
    isRequired: jest.fn().mockResolvedValue(false),
    challenge: jest.fn(),
  };
});

const actor = { userId: null, ip: '10.0.0.1' };

// Los loggers son singletons de Winston que escriben a disco (logs/*.txt) —
// se mockean para que el test no dependa del filesystem ni lo ensucie.
jest.mock('@/config/module-loggers', () => ({
  authErrorLogger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
}));
jest.mock('@/config/db-loggers', () => ({
  selectLogger: { info: jest.fn(), warn: jest.fn() },
  insertLogger: { info: jest.fn() },
}));
// argon2 es un binding nativo (propiedades no configurables) — jest.spyOn
// no puede reemplazarlas, hace falta mockear el módulo entero.
jest.mock('argon2');
// login() aplica un piso de tiempo (padToMinDuration) para parejar la rama
// "nickUsuario no existe" con la rama real — se mockea acá para que los
// tests de arriba no paguen ese delay real de forma innecesaria; el
// comportamiento del padding en sí se prueba aparte, más abajo.
jest.mock('@/common/utils/timing-safe.util', () => ({
  padToMinDuration: jest.fn().mockResolvedValue(undefined),
}));
// getTransporter() crea un transporter real de nodemailer — se mockea para
// que requestResetPassword() no intente conectarse a un SMTP real.
jest.mock('@/config/mailer', () => ({
  getTransporter: jest.fn(),
}));

describe('AuthService.login', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      'findByNickWithPassword' | 'registerFailedLogin' | 'clearLoginLock'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let auditService: { record: jest.Mock };

  const baseUser = {
    idUser: 1,
    nickUsuario: 'user1',
    nombre: 'User',
    role: Role.MEDICO,
    password: 'hashed-password',
  };

  beforeEach(() => {
    usersService = {
      findByNickWithPassword: jest.fn(),
      registerFailedLogin: jest.fn().mockResolvedValue(false),
      clearLoginLock: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { signAsync: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    (padToMinDuration as jest.Mock).mockClear();

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      auditService as unknown as AuditService,
      twoFactorService as unknown as TwoFactorService,
    );
  });

  it('devuelve el mismo mensaje genérico si el nickUsuario no existe', async () => {
    usersService.findByNickWithPassword.mockResolvedValue(null);

    await expect(
      authService.login(
        { nickUsuario: 'no-existe', password: 'lo-que-sea' },
        actor,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Usuario o contraseña inválidos/),
    });
  });

  it('devuelve el mismo mensaje genérico si la contraseña es incorrecta', async () => {
    usersService.findByNickWithPassword.mockResolvedValue(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      authService.login(
        {
          nickUsuario: baseUser.nickUsuario,
          password: 'incorrecta',
        },
        actor,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Usuario o contraseña inválidos/),
    });
  });

  it('ambos casos de fallo lanzan la misma excepción (no hay forma de distinguirlos desde afuera)', async () => {
    usersService.findByNickWithPassword.mockResolvedValueOnce(null);
    let errorNickInexistente: unknown;
    try {
      await authService.login(
        { nickUsuario: 'no-existe', password: 'x' },
        actor,
      );
    } catch (error) {
      errorNickInexistente = error;
    }

    usersService.findByNickWithPassword.mockResolvedValueOnce(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    let errorPasswordIncorrecta: unknown;
    try {
      await authService.login(
        {
          nickUsuario: baseUser.nickUsuario,
          password: 'x',
        },
        actor,
      );
    } catch (error) {
      errorPasswordIncorrecta = error;
    }

    expect(errorNickInexistente).toBeInstanceOf(UnauthorizedException);
    expect(errorPasswordIncorrecta).toBeInstanceOf(UnauthorizedException);
    expect((errorNickInexistente as UnauthorizedException).message).toBe(
      (errorPasswordIncorrecta as UnauthorizedException).message,
    );
  });

  it('devuelve un token cuando el nickUsuario y la contraseña son correctos', async () => {
    usersService.findByNickWithPassword.mockResolvedValue(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValue('un-jwt-cualquiera');

    const result = await authService.login(
      {
        nickUsuario: baseUser.nickUsuario,
        password: 'correcta',
      },
      actor,
    );

    expect(result).toEqual({ token: 'un-jwt-cualquiera' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      idUser: baseUser.idUser,
      nickUsuario: baseUser.nickUsuario,
      role: baseUser.role,
      name: baseUser.nombre,
      jti: expect.any(String),
    });
  });

  it('empareja el tiempo de respuesta (padToMinDuration) en las tres ramas, para cerrar el oráculo de tiempo', async () => {
    // rama "nickUsuario no existe"
    usersService.findByNickWithPassword.mockResolvedValueOnce(null);
    await expect(
      authService.login({ nickUsuario: 'no-existe', password: 'x' }, actor),
    ).rejects.toThrow(UnauthorizedException);

    // rama "contraseña incorrecta"
    usersService.findByNickWithPassword.mockResolvedValueOnce(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      authService.login(
        { nickUsuario: baseUser.nickUsuario, password: 'x' },
        actor,
      ),
    ).rejects.toThrow(UnauthorizedException);

    // rama "login exitoso"
    usersService.findByNickWithPassword.mockResolvedValueOnce(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
    jwtService.signAsync.mockResolvedValueOnce('un-jwt-cualquiera');
    await authService.login(
      {
        nickUsuario: baseUser.nickUsuario,
        password: 'correcta',
      },
      actor,
    );

    expect(padToMinDuration).toHaveBeenCalledTimes(3);
  });

  it('cuenta bloqueada: rechaza SIN verificar la clave, con el mismo mensaje', async () => {
    usersService.findByNickWithPassword.mockResolvedValue({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 60_000),
    } as any);
    (argon2.verify as jest.Mock).mockClear();

    await expect(
      authService.login(
        { nickUsuario: baseUser.nickUsuario, password: 'correcta' },
        actor,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Usuario o contraseña inválidos/),
    });
    expect(argon2.verify).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: AuditResult.DENIED,
        reason: 'Cuenta bloqueada temporalmente por intentos fallidos',
      }),
    );
  });

  it('clave incorrecta suma un intento; entrar bien pone el contador en cero', async () => {
    usersService.findByNickWithPassword.mockResolvedValueOnce({
      ...baseUser,
      failedLoginCount: 3,
    } as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      authService.login(
        { nickUsuario: baseUser.nickUsuario, password: 'mala' },
        actor,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersService.registerFailedLogin).toHaveBeenCalledWith(
      baseUser.idUser,
    );

    usersService.findByNickWithPassword.mockResolvedValueOnce({
      ...baseUser,
      failedLoginCount: 4,
    } as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
    jwtService.signAsync.mockResolvedValueOnce('jwt');
    await authService.login(
      { nickUsuario: baseUser.nickUsuario, password: 'ok' },
      actor,
    );
    expect(usersService.clearLoginLock).toHaveBeenCalledWith(baseUser.idUser);
  });

  it('si hace falta el 2.º paso, devuelve un challenge y NO una sesión', async () => {
    usersService.findByNickWithPassword.mockResolvedValue(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    twoFactorService.isRequired.mockResolvedValue(true);
    twoFactorService.challenge.mockResolvedValue({
      twoFactor: 'verify',
      challengeToken: 'c',
    });

    const result = await authService.login(
      { nickUsuario: baseUser.nickUsuario, password: 'ok' },
      actor,
    );

    expect(result).toEqual({ twoFactor: 'verify', challengeToken: 'c' });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.LOGIN, result: undefined }),
    );
  });

  it('audita el login exitoso a nombre del usuario, con la IP', async () => {
    usersService.findByNickWithPassword.mockResolvedValue(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValue('jwt');

    await authService.login(
      { nickUsuario: baseUser.nickUsuario, password: 'ok' },
      actor,
    );

    expect(auditService.record).toHaveBeenCalledWith({
      actor: { userId: baseUser.idUser, ip: '10.0.0.1' },
      action: AuditAction.LOGIN,
      resourceType: 'user',
      resourceId: baseUser.idUser,
    });
  });

  it('audita los intentos fallidos como DENIED, sin actor y con el usuario intentado', async () => {
    usersService.findByNickWithPassword.mockResolvedValueOnce(baseUser as any);
    (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      authService.login(
        { nickUsuario: baseUser.nickUsuario, password: 'mala' },
        actor,
      ),
    ).rejects.toThrow(UnauthorizedException);

    usersService.findByNickWithPassword.mockResolvedValueOnce(null);
    await expect(
      authService.login({ nickUsuario: 'no-existe', password: 'x' }, actor),
    ).rejects.toThrow(UnauthorizedException);

    expect(auditService.record.mock.calls.map(([e]) => e)).toEqual([
      expect.objectContaining({
        actor: { userId: null, ip: '10.0.0.1' },
        action: AuditAction.LOGIN,
        result: AuditResult.DENIED,
        resourceId: baseUser.idUser,
        metadata: { nickUsuario: baseUser.nickUsuario },
      }),
      expect.objectContaining({
        result: AuditResult.DENIED,
        resourceId: null,
        metadata: { nickUsuario: 'no-existe' },
      }),
    ]);
  });
});

describe('AuthService.requestResetPassword', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findOneByNick' | 'updateTokenResetPassword'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let auditService: { record: jest.Mock };
  let sendMail: jest.Mock;

  const baseUser = {
    idUser: 1,
    nickUsuario: 'user1',
    email: 'guardado@example.com' as string | null,
  };

  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MAIL_USER: 'soporte@example.com' };

    usersService = {
      findOneByNick: jest.fn(),
      updateTokenResetPassword: jest.fn(),
    };
    jwtService = { signAsync: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    sendMail = jest.fn().mockResolvedValue(undefined);
    (getTransporter as jest.Mock).mockReturnValue({ sendMail });
    (padToMinDuration as jest.Mock).mockClear();

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      auditService as unknown as AuditService,
      twoFactorService as unknown as TwoFactorService,
    );
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('responde sin mandar mail ni tocar la base si el nickUsuario no existe (anti-enumeración)', async () => {
    usersService.findOneByNick.mockResolvedValue(null);

    await expect(
      authService.requestResetPassword({
        nickUsuario: 'no-existe',
        email: 'quien-sea@example.com',
      }),
    ).resolves.toBeUndefined();

    expect(sendMail).not.toHaveBeenCalled();
    expect(usersService.updateTokenResetPassword).not.toHaveBeenCalled();
    expect(padToMinDuration).toHaveBeenCalledTimes(1);
  });

  it('manda el enlace al email guardado si el del pedido coincide (sin importar mayúsculas)', async () => {
    usersService.findOneByNick.mockResolvedValue(baseUser as any);
    usersService.updateTokenResetPassword.mockResolvedValue({ success: true });

    await authService.requestResetPassword({
      nickUsuario: baseUser.nickUsuario,
      email: ' Guardado@Example.com ',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'guardado@example.com' }),
    );
  });

  it('si el email no coincide con el guardado, no manda nada y responde igual', async () => {
    usersService.findOneByNick.mockResolvedValue(baseUser as any);

    await expect(
      authService.requestResetPassword({
        nickUsuario: baseUser.nickUsuario,
        email: 'atacante@example.com',
      }),
    ).resolves.toBeUndefined();

    expect(usersService.updateTokenResetPassword).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(padToMinDuration).toHaveBeenCalledTimes(1);
  });

  it('un usuario SIN email no recibe enlace ni se le asocia el del pedido (lo resuelve el admin)', async () => {
    usersService.findOneByNick.mockResolvedValue({
      ...baseUser,
      email: null,
    } as any);

    await expect(
      authService.requestResetPassword({
        nickUsuario: baseUser.nickUsuario,
        email: 'atacante@example.com',
      }),
    ).resolves.toBeUndefined();

    expect(usersService.updateTokenResetPassword).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(padToMinDuration).toHaveBeenCalledTimes(1);
  });

  it('empareja el tiempo también si falla generar el token', async () => {
    usersService.findOneByNick.mockResolvedValue(baseUser as any);
    usersService.updateTokenResetPassword.mockResolvedValue({ success: false });

    await expect(
      authService.requestResetPassword({
        nickUsuario: baseUser.nickUsuario,
        email: 'guardado@example.com',
      }),
    ).rejects.toMatchObject({
      message: 'No se pudo generar el token de recuperación.',
    });
    expect(padToMinDuration).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
