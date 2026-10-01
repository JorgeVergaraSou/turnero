import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { getStorageToken } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
} from './e2e-helpers';
import { ClinicFixture, createClinic } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { DEVICE_AUTH_KEY } from '../src/displays/decorators/device-auth.decorator';
import {
  PERMISSIONS_KEY,
  Permission,
} from '../src/auth/permissions/permission.enum';
import { roleHasPermissions } from '../src/auth/permissions/role-permissions';

// Ningún mail sale de verdad: se registra a quién iría (para ver, por
// ejemplo, si un enlace de recuperación le llegaría a un atacante).
const sentMails: { to: string; html: string }[] = [];
jest.mock('../src/config/mailer', () => ({
  getTransporter: () => ({
    sendMail: (mail: { to: string; html: string }) => {
      sentMails.push(mail);
      return Promise.resolve();
    },
  }),
}));

interface RouteInfo {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  isPublic: boolean;
  /** autenticada con token de pantalla, no con sesión de usuario */
  isDeviceAuth: boolean;
  roles?: Role[];
  permissions?: Permission[];
}

/** Todos los endpoints de la app, leídos de los decoradores de Nest. */
function discoverRoutes(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const clean = (p: string) => p.replace(/^\/+|\/+$/g, '');
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as
        | (new (...args: never[]) => object)
        | null;
      if (!controller) continue;
      const base = clean(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | undefined;
        if (path === undefined) continue;
        const meta = <T>(key: string): T | undefined =>
          Reflect.getMetadata(key, handler) ??
          Reflect.getMetadata(key, controller);
        const method = RequestMethod[
          Reflect.getMetadata(METHOD_METADATA, handler) as number
        ].toLowerCase() as RouteInfo['method'];
        routes.push({
          method,
          path: `${API}/${[base, clean(path)].filter(Boolean).join('/')}`,
          isDeviceAuth: meta<boolean>(DEVICE_AUTH_KEY) === true,
          isPublic:
            meta<boolean>(IS_PUBLIC_KEY) === true &&
            meta<boolean>(DEVICE_AUTH_KEY) !== true,
          roles: meta<Role[]>(ROLES_KEY),
          permissions: meta<Permission[]>(PERMISSIONS_KEY),
        });
      }
    }
  }
  return routes;
}

type Access = 'allow' | 'deny';
/** Lo que DEBERÍA pasar según los decoradores y la tabla de permisos. */
function expectedAccess(
  route: RouteInfo,
  role: Role | null,
): Access | 'unauthenticated' | 'undeclared' {
  if (route.isPublic) return 'allow';
  // token de pantalla: NINGUNA sesión de usuario sirve, ni la de ADMIN
  if (route.isDeviceAuth) return 'unauthenticated';
  if (role === null) return 'unauthenticated';
  if (route.roles?.length) {
    // RolesGuard: ADMIN pasa en todo lo marcado con @Auth(...)
    return role === Role.ADMIN || route.roles.includes(role) ? 'allow' : 'deny';
  }
  if (route.permissions?.length) {
    return roleHasPermissions(role, route.permissions) ? 'allow' : 'deny';
  }
  return 'undeclared';
}

/** 1x1 PNG real */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Seguridad de TODA la API (la reserva pública tiene su propia batería en
 * public-security.e2e-spec.ts). Cada test ataca la API directo, como
 * alguien con curl/Postman y, cuando corresponde, con una sesión válida
 * de un rol que no debería poder.
 */
describe('Seguridad de toda la API (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinic: ClinicFixture;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  const clearRateLimits = () => app.get(getStorageToken()).storage.clear();
  beforeEach(() => {
    clearRateLimits();
    sentMails.length = 0;
  });

  const nickOf = async (userId: number) =>
    (
      await dataSource.query(
        'SELECT nick_usuario AS nick FROM users WHERE id_user = ?',
        [userId],
      )
    )[0].nick as string;

  describe('matriz de permisos: todos los endpoints × todos los roles', () => {
    let routes: RouteInfo[];
    beforeAll(() => {
      routes = discoverRoutes(app);
    });

    it('descubre todos los endpoints de la app', () => {
      expect(routes.length).toBeGreaterThan(50);
    });

    it('ningún endpoint privado queda "abierto a cualquier usuario logueado" sin declarar quién puede usarlo', () => {
      const undeclared = routes
        .filter((r) => expectedAccess(r, Role.MEDICO) === 'undeclared')
        .map((r) => `${r.method.toUpperCase()} ${r.path}`);
      expect(undeclared).toEqual([]);
    });

    it('los endpoints públicos son exactamente los esperados', () => {
      const publicRoutes = routes
        .filter((r) => r.isPublic)
        .map((r) => `${r.method.toUpperCase()} ${r.path}`)
        .sort();
      expect(publicRoutes).toEqual(
        [
          'GET /api/public/health-insurances',
          'GET /api/public/professionals',
          'GET /api/public/professionals/:id/availability',
          'GET /api/public/settings',
          'GET /api/public/specialties',
          'POST /api/auth/2fa/enable',
          'POST /api/auth/2fa/setup',
          'POST /api/auth/2fa/verify',
          'POST /api/auth/login',
          'POST /api/auth/requestResetPassword',
          'POST /api/auth/resetPassword',
          'POST /api/public/appointments',
          'POST /api/public/appointments/cancel',
          'POST /api/public/appointments/lookup',
        ].sort(),
      );
    });

    it('los endpoints con token de pantalla son exactamente los esperados', () => {
      const deviceRoutes = routes
        .filter((r) => r.isDeviceAuth)
        .map((r) => `${r.method.toUpperCase()} ${r.path}`)
        .sort();
      expect(deviceRoutes).toEqual(['GET /api/display/stream']);
    });

    it('cada endpoint responde según la matriz: sin sesión 401, rol sin permiso 403, rol con permiso pasa', async () => {
      const identities: {
        role: Role | null;
        token?: string;
        userId?: number;
      }[] = [
        { role: null },
        { role: Role.ADMIN, ...admin },
        { role: Role.RECEPCIONISTA, ...reception },
        { role: Role.MEDICO, ...clinic.doctor },
      ];
      const failures: string[] = [];
      for (const route of routes) {
        for (const identity of identities) {
          // ids inexistentes: nada se modifica; el propio id donde la
          // regla es "solo lo tuyo" (así se prueba el guard, no la regla)
          const url = route.path.replace(/:\w+/g, () =>
            route.path.includes('updateUser') && identity.userId
              ? String(identity.userId)
              : '999999',
          );
          // cerrar sesión ANULARÍA el token de la identidad y rompería el
          // resto de la matriz: con sesión se prueba en su propio test
          if (route.path.endsWith('/auth/logout') && identity.token) continue;
          clearRateLimits();
          let req = request(server)[route.method](url);
          if (identity.token) req = req.set(auth(identity.token));
          const res =
            route.method === 'get' || route.method === 'delete'
              ? await req
              : await req.send({});
          const guardDenied =
            res.status === 403 && res.body.message === 'Forbidden resource';
          const expected = expectedAccess(route, identity.role);
          const who = identity.role ?? 'SIN SESIÓN';
          const label = `${route.method.toUpperCase()} ${route.path} como ${who}`;
          if (expected === 'unauthenticated' && res.status !== 401) {
            failures.push(`${label}: esperaba 401, dio ${res.status}`);
          } else if (expected === 'deny' && !guardDenied) {
            failures.push(`${label}: esperaba 403, dio ${res.status}`);
          } else if (
            expected === 'allow' &&
            (res.status === 401 || guardDenied)
          ) {
            failures.push(`${label}: debía pasar, dio ${res.status}`);
          } else if (res.status >= 500) {
            failures.push(`${label}: error interno ${res.status}`);
          }
        }
      }
      expect(failures).toEqual([]);
    }, 120000);
  });

  describe('recuperación de contraseña', () => {
    it('un usuario SIN email: pedir recuperación con el email de un atacante NO le asocia ese email ni le manda el enlace', async () => {
      const victim = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = await nickOf(victim.userId);

      const res = await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({ nickUsuario: nick, email: 'atacante@example.com' });
      expect(res.status).toBeLessThan(500);

      const [row] = await dataSource.query(
        'SELECT email, reset_password_token AS token FROM users WHERE id_user = ?',
        [victim.userId],
      );
      expect(row.email).toBeNull();
      expect(row.token).toBeNull();
      expect(sentMails.filter((m) => m.to === 'atacante@example.com')).toEqual(
        [],
      );
    });

    it('un usuario CON email: con otro email no se manda nada; con el suyo, el enlace va a su email', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const real = `real-${user.userId}@example.com`;
      await dataSource.query('UPDATE users SET email = ? WHERE id_user = ?', [
        real,
        user.userId,
      ]);
      const nick = await nickOf(user.userId);

      await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({ nickUsuario: nick, email: 'atacante@example.com' });
      expect(sentMails).toEqual([]);

      clearRateLimits();
      await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({ nickUsuario: nick, email: real.toUpperCase() });
      expect(sentMails.map((m) => m.to)).toEqual([real]);
    });

    it('usuario inexistente: misma respuesta que uno real (no enumera usuarios)', async () => {
      const real = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await dataSource.query('UPDATE users SET email = ? WHERE id_user = ?', [
        `real-${real.userId}@example.com`,
        real.userId,
      ]);
      const a = await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({
          nickUsuario: await nickOf(real.userId),
          email: 'x@example.com',
        });
      clearRateLimits();
      const b = await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({ nickUsuario: 'no-existe-nadie', email: 'x@example.com' });
      expect(a.status).toBe(b.status);
      expect(a.body).toEqual(b.body);
    });

    it('token de recuperación inventado → 400, y no se puede reusar uno ya usado', async () => {
      await request(server)
        .post(`${API}/auth/resetPassword`)
        .send({
          resetPasswordToken: '7f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
          password: 'Nuev4-Clave-segura',
        })
        .expect(400);

      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await dataSource.query('UPDATE users SET email = ? WHERE id_user = ?', [
        `reuse-${user.userId}@example.com`,
        user.userId,
      ]);
      await request(server)
        .post(`${API}/auth/requestResetPassword`)
        .send({
          nickUsuario: await nickOf(user.userId),
          email: `reuse-${user.userId}@example.com`,
        });
      const token = /token=([0-9a-f-]{36})/.exec(sentMails[0].html)![1];
      await request(server)
        .post(`${API}/auth/resetPassword`)
        .send({ resetPasswordToken: token, password: 'Nuev4-Clave-segura' })
        .expect(201);
      clearRateLimits();
      await request(server)
        .post(`${API}/auth/resetPassword`)
        .send({ resetPasswordToken: token, password: 'Otr4-Clave-segura' })
        .expect(400);
    });
  });

  describe('sesiones después de cambiar la contraseña', () => {
    it('cambiar la propia clave invalida los tokens emitidos antes', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      // el iat del JWT va en segundos: el cambio tiene que ser en un segundo posterior
      await new Promise((r) => setTimeout(r, 1100));
      await request(server)
        .patch(`${API}/auth/updateUser/${user.userId}`)
        .set(auth(user.token))
        .send({ currentPassword: 'Passw0rd-e2e', password: 'Otr4-Clave-e2e' })
        .expect(200);
      await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(user.token))
        .expect(401);

      const relogin = await request(server)
        .post(`${API}/auth/login`)
        .send({
          nickUsuario: await nickOf(user.userId),
          password: 'Otr4-Clave-e2e',
        })
        .expect(200);
      await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(relogin.body.token))
        .expect(200);
    });

    it('si el admin restablece la clave de alguien, la sesión robada deja de servir', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await new Promise((r) => setTimeout(r, 1100));
      await request(server)
        .post(`${API}/auth/restablecer-clave/${user.userId}`)
        .set(auth(admin.token))
        .send({ password: 'Nuev4-Clave-e2e' })
        .expect(201);
      await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(user.token))
        .expect(401);
    });
  });

  describe('cerrar sesión', () => {
    it('anula ESA sesión en el servidor; las otras del mismo usuario siguen', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      clearRateLimits();
      const other = await request(server)
        .post(`${API}/auth/login`)
        .send({
          nickUsuario: await nickOf(user.userId),
          password: 'Passw0rd-e2e',
        })
        .expect(200);

      await request(server)
        .post(`${API}/auth/logout`)
        .set(auth(user.token))
        .expect(204);

      // la sesión cerrada ya no sirve aunque el token no haya vencido…
      await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(user.token))
        .expect(401);
      // …la otra (otra PC) sigue
      await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(other.body.token))
        .expect(200);

      const [row] = await dataSource.query(
        "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'LOGOUT' AND resource_id = ?",
        [String(user.userId)],
      );
      expect(Number(row.n)).toBe(1);
    });
  });

  describe('bloqueo por intentos fallidos', () => {
    const login = async (nick: string, password: string) => {
      clearRateLimits(); // el límite por minuto se prueba aparte
      return request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario: nick, password });
    };

    it('10 claves incorrectas seguidas bloquean la cuenta: ni la correcta entra', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = await nickOf(user.userId);
      for (let i = 0; i < 10; i++) {
        await login(nick, `mala-${i}`).then((r) => expect(r.status).toBe(401));
      }
      const blocked = await login(nick, 'Passw0rd-e2e');
      expect(blocked.status).toBe(401);

      // mismo mensaje que una clave incorrecta: no revela que está bloqueada
      const wrong = await login('nadie-existe', 'x');
      expect(blocked.body.message).toBe(wrong.body.message);

      const [log] = await dataSource.query(
        "SELECT reason FROM audit_logs WHERE action = 'LOGIN' AND result = 'DENIED' AND resource_id = ? AND reason LIKE 'Se bloqueó%'",
        [String(user.userId)],
      );
      expect(log.reason).toMatch(/Se bloqueó la cuenta 15 minutos/);
    });

    it('el admin la desbloquea y la clave correcta vuelve a entrar', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = await nickOf(user.userId);
      for (let i = 0; i < 10; i++) await login(nick, `mala-${i}`);

      const list = await request(server)
        .get(`${API}/auth/listar-usuarios`)
        .set(auth(admin.token))
        .expect(200);
      expect(
        list.body.find((u: { idUser: number }) => u.idUser === user.userId)
          .lockedUntil,
      ).not.toBeNull();

      await request(server)
        .patch(`${API}/auth/desbloquear-usuario/${user.userId}`)
        .set(auth(admin.token))
        .expect(200);
      await login(nick, 'Passw0rd-e2e').then((r) => expect(r.status).toBe(200));
    });

    it('el bloqueo vence solo', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await dataSource.query(
        'UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id_user = ?',
        [user.userId],
      );
      await login(await nickOf(user.userId), 'Passw0rd-e2e').then((r) =>
        expect(r.status).toBe(200),
      );
    });

    it('entrar bien antes del décimo intento pone el contador en cero', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = await nickOf(user.userId);
      for (let i = 0; i < 9; i++) await login(nick, `mala-${i}`);
      await login(nick, 'Passw0rd-e2e').then((r) => expect(r.status).toBe(200));
      // 9 fallos más no la bloquean (el contador había vuelto a 0)
      for (let i = 0; i < 9; i++) await login(nick, `mala-${i}`);
      await login(nick, 'Passw0rd-e2e').then((r) => expect(r.status).toBe(200));
    });

    it('recepción no puede desbloquear usuarios', async () => {
      await request(server)
        .patch(`${API}/auth/desbloquear-usuario/${admin.userId}`)
        .set(auth(reception.token))
        .expect(403);
    });
  });

  describe('datos de tipo inesperado no rompen el servidor (500)', () => {
    it.each([
      ['nombre numérico', { currentPassword: 'x', nombre: 12345 }],
      ['apellido como objeto', { currentPassword: 'x', apellido: { a: 1 } }],
      ['nombre null', { currentPassword: 'x', nombre: null }],
    ])('editar mi perfil con %s → 400', async (_n, body) => {
      await request(server)
        .patch(`${API}/auth/updateUser/${reception.userId}`)
        .set(auth(reception.token))
        .send(body)
        .expect(400);
    });

    it.each([
      [
        'nombre numérico',
        {
          nombre: 1,
          apellido: 'X',
          nickUsuario: 'nick-ok-1',
          email: 'nick-ok-1@example.com',
          password: 'Passw0rd-e2e',
          role: 'RECEPCIONISTA',
        },
      ],
      [
        'sin apellido',
        {
          nombre: 'X',
          nickUsuario: 'nick-ok-2',
          email: 'nick-ok-2@example.com',
          password: 'Passw0rd-e2e',
          role: 'RECEPCIONISTA',
        },
      ],
    ])('crear usuario con %s → 400', async (_n, body) => {
      await request(server)
        .post(`${API}/auth/nuevo-usuario`)
        .set(auth(admin.token))
        .send(body)
        .expect(400);
    });
  });

  describe('escalada de privilegios', () => {
    it('un usuario no puede darse otro rol editando su perfil', async () => {
      await request(server)
        .patch(`${API}/auth/updateUser/${reception.userId}`)
        .set(auth(reception.token))
        .send({ currentPassword: 'Passw0rd-e2e', role: 'ADMIN' })
        .expect(400);
      const [row] = await dataSource.query(
        'SELECT role FROM users WHERE id_user = ?',
        [reception.userId],
      );
      expect(row.role).toBe('RECEPCIONISTA');
    });

    it('un usuario no puede editar el perfil de otro', async () => {
      await request(server)
        .patch(`${API}/auth/updateUser/${admin.userId}`)
        .set(auth(reception.token))
        .send({ currentPassword: 'Passw0rd-e2e', nombre: 'Hackeado' })
        .expect(403);
    });

    it('crear un usuario con un rol inventado → 400', async () => {
      await request(server)
        .post(`${API}/auth/nuevo-usuario`)
        .set(auth(admin.token))
        .send({
          nombre: 'X',
          apellido: 'Y',
          nickUsuario: 'nick-super',
          email: 'nick-super@example.com',
          password: 'Passw0rd-e2e',
          role: 'SUPERADMIN',
        })
        .expect(400);
    });
  });

  describe('email obligatorio para el personal', () => {
    const newUser = (overrides: Record<string, unknown> = {}) => ({
      nombre: 'Nueva',
      apellido: 'Persona',
      nickUsuario: `nuevo-${Date.now() % 1e7}`,
      password: 'Passw0rd-e2e',
      role: 'RECEPCIONISTA',
      email: `nuevo-${Date.now()}@example.com`,
      ...overrides,
    });

    it.each([
      ['sin email', { email: undefined }],
      ['email vacío', { email: '' }],
      ['email inválido', { email: 'no-es-email' }],
    ])('crear un usuario %s → 400', async (_n, overrides) => {
      await request(server)
        .post(`${API}/auth/nuevo-usuario`)
        .set(auth(admin.token))
        .send(newUser(overrides))
        .expect(400);
    });

    it('con email válido se crea, y un email repetido → 409', async () => {
      const body = newUser();
      await request(server)
        .post(`${API}/auth/nuevo-usuario`)
        .set(auth(admin.token))
        .send(body)
        .expect(201);
      await request(server)
        .post(`${API}/auth/nuevo-usuario`)
        .set(auth(admin.token))
        .send(
          newUser({ nickUsuario: `${body.nickUsuario}b`, email: body.email }),
        )
        .expect(409);
    });

    it('el email no se puede borrar: ni el admin ni el propio usuario', async () => {
      await request(server)
        .patch(`${API}/auth/editar-usuario/${reception.userId}`)
        .set(auth(admin.token))
        .send({ email: null })
        .expect(400);
      await request(server)
        .patch(`${API}/auth/updateUser/${reception.userId}`)
        .set(auth(reception.token))
        .send({ currentPassword: 'Passw0rd-e2e', email: null })
        .expect(400);
    });
  });

  describe('auditoría de accesos', () => {
    const accessLogs = async () =>
      (
        await request(server)
          .get(`${API}/admin/audit-logs`)
          .query({ category: 'ACCESS', limit: 100 })
          .set(auth(admin.token))
          .expect(200)
      ).body.items as {
        action: string;
        result: string;
        resourceId: string | null;
        metadata: Record<string, unknown> | null;
        actor: { id: number } | null;
      }[];

    it('quedan registrados el login exitoso y los fallidos (con el usuario intentado)', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = await nickOf(user.userId);
      clearRateLimits();
      await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario: nick, password: 'clave-mala' })
        .expect(401);
      await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario: 'usuario-que-no-existe', password: 'x' })
        .expect(401);

      const logs = await accessLogs();
      // el login exitoso lo hizo createUserAndLogin
      expect(logs).toContainEqual(
        expect.objectContaining({
          action: 'LOGIN',
          result: 'SUCCESS',
          actor: expect.objectContaining({ id: user.userId }),
        }),
      );
      expect(logs).toContainEqual(
        expect.objectContaining({
          action: 'LOGIN',
          result: 'DENIED',
          resourceId: String(user.userId),
          actor: null,
          metadata: { nickUsuario: nick },
        }),
      );
      expect(logs).toContainEqual(
        expect.objectContaining({
          action: 'LOGIN',
          result: 'DENIED',
          resourceId: null,
          metadata: { nickUsuario: 'usuario-que-no-existe' },
        }),
      );
    });

    it('quedan registrados el alta de usuarios y los cambios de clave', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await request(server)
        .patch(`${API}/auth/updateUser/${user.userId}`)
        .set(auth(user.token))
        .send({ currentPassword: 'Passw0rd-e2e', password: 'Otr4-Clave-e2e' })
        .expect(200);

      const logs = await accessLogs();
      expect(logs).toContainEqual(
        expect.objectContaining({
          action: 'PASSWORD_CHANGE',
          resourceId: String(user.userId),
          actor: expect.objectContaining({ id: user.userId }),
        }),
      );

      const created = await request(server)
        .get(`${API}/admin/audit-logs`)
        .query({ category: 'ADMINISTRATIVE', limit: 100 })
        .set(auth(admin.token))
        .expect(200);
      const actions = created.body.items.map(
        (l: { action: string }) => l.action,
      );
      expect(actions).toContain('USER_CREATE');
      // los logins van en "accesos", no mezclados con lo administrativo
      expect(actions).not.toContain('LOGIN');
    });
  });

  describe('foto de perfil', () => {
    const upload = (content: Buffer, filename: string, contentType: string) =>
      request(server)
        .post(`${API}/auth/foto`)
        .set(auth(reception.token))
        .attach('file', content, { filename, contentType });

    it('una imagen real se acepta', async () => {
      await upload(PNG, 'foto.png', 'image/png').expect(201);
    });

    it('un archivo que no es imagen → 400', async () => {
      await upload(
        Buffer.from('<?php echo 1; ?>'),
        'shell.php',
        'application/x-php',
      ).expect(400);
    });

    it('HTML disfrazado de imagen (Content-Type falso) → 400', async () => {
      await upload(
        Buffer.from('<html><script>alert(document.cookie)</script></html>'),
        'foto.png',
        'image/png',
      ).expect(400);
    });

    it('SVG (puede llevar JavaScript) → 400', async () => {
      await upload(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        ),
        'foto.svg',
        'image/svg+xml',
      ).expect(400);
    });

    it('archivo de más de 5 MB → rechazado', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
      const res = await upload(big, 'grande.png', 'image/png');
      expect([400, 413]).toContain(res.status);
    });
  });

  describe('buscadores y listados', () => {
    it.each([["%' OR '1'='1"], ['%'], ['_'], ["'; DROP TABLE patients;--"]])(
      'buscar pacientes con %p no se ejecuta como SQL ni trae todo',
      async (q) => {
        const res = await request(server)
          .get(`${API}/admin/patients`)
          .query({ q })
          .set(auth(reception.token))
          .expect(200);
        expect(res.body.items).toEqual([]);
      },
    );

    it('pedir 1.000.000 de pacientes de una vez devuelve como mucho 100', async () => {
      const res = await request(server)
        .get(`${API}/admin/patients`)
        .query({ limit: 1000000 })
        .set(auth(reception.token))
        .expect(200);
      expect(res.body.limit).toBeLessThanOrEqual(100);
    });

    it('auditoría: más de 100 registros por página → 400', async () => {
      await request(server)
        .get(`${API}/admin/audit-logs`)
        .query({ limit: 100000 })
        .set(auth(admin.token))
        .expect(400);
    });

    it('turnos: un rango de fechas gigante → 400', async () => {
      await request(server)
        .get(`${API}/admin/appointments`)
        .query({ from: '2000-01-01', to: '2099-12-31' })
        .set(auth(reception.token))
        .expect(400);
    });
  });

  describe('login', () => {
    it('el 6.º intento fallido en un minuto para el mismo usuario → 429', async () => {
      const nick = await nickOf(reception.userId);
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post(`${API}/auth/login`)
          .send({ nickUsuario: nick, password: 'mala' })
          .expect(401);
      }
      await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario: nick, password: 'mala' })
        .expect(429);
    });

    it('usuario inexistente y clave incorrecta dan exactamente la misma respuesta', async () => {
      const a = await request(server)
        .post(`${API}/auth/login`)
        .send({
          nickUsuario: await nickOf(reception.userId),
          password: 'mala-clave',
        });
      const b = await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario: 'nadie-existe', password: 'mala-clave' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('las respuestas de usuarios nunca incluyen la contraseña ni el token de recuperación', async () => {
      const list = await request(server)
        .get(`${API}/auth/listar-usuarios`)
        .set(auth(admin.token))
        .expect(200);
      const profile = await request(server)
        .get(`${API}/auth/profile`)
        .set(auth(reception.token))
        .expect(200);
      const text = JSON.stringify([list.body, profile.body]);
      expect(text).not.toMatch(/password|resetPassword|\$argon2/i);
    });
  });
});
