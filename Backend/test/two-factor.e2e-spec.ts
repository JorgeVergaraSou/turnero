import { INestApplication } from '@nestjs/common';
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
import { Role } from '../src/common/enums/role.enum';
import {
  base32Decode,
  currentStep,
  totpAt,
} from '../src/auth/two-factor/totp.util';

/**
 * Verificación en dos pasos, de punta a punta. Los códigos se calculan acá
 * con el mismo algoritmo que la app del celular (TOTP), a partir del
 * secreto que devuelve el QR.
 */
describe('Verificación en dos pasos (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  const PASSWORD = 'Passw0rd-e2e';

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    // obligatoria para médicos en esta batería
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ twoFactorRoles: ['MEDICO'] })
      .expect(200);
  }, 120000);

  afterAll(async () => {
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ twoFactorRoles: [] });
    await app.close();
  });

  const clearRateLimits = () => app.get(getStorageToken()).storage.clear();
  beforeEach(clearRateLimits);

  /** crea un médico directo en la base (sin pasar por el login) */
  const newDoctor = async () => {
    const [{ id }] = await dataSource.query(
      'SELECT MAX(id_user) + 1 AS id FROM users',
    );
    // createUserAndLogin haría login: con 2FA obligatorio no devuelve token
    const nick = `med2fa-${Date.now() % 1e7}-${id}`;
    const argon2 = await import('argon2');
    await dataSource.query(
      'INSERT INTO users (nick_usuario, nombre, apellido, password, role) VALUES (?, ?, ?, ?, ?)',
      [nick, 'Doc', 'Dos Pasos', await argon2.hash(PASSWORD), 'MEDICO'],
    );
    const [row] = await dataSource.query(
      'SELECT id_user AS id FROM users WHERE nick_usuario = ?',
      [nick],
    );
    return { nick, userId: row.id as number };
  };

  const login = (nick: string, password = PASSWORD) => {
    clearRateLimits();
    return request(server)
      .post(`${API}/auth/login`)
      .send({ nickUsuario: nick, password });
  };
  const codeFor = (secret: string, offset = 0) =>
    totpAt(base32Decode(secret), currentStep() + offset);

  /** hace todo el alta y devuelve el secreto y los códigos de recuperación */
  const enroll = async (nick: string) => {
    const first = await login(nick).expect(200);
    const setup = await request(server)
      .post(`${API}/auth/2fa/setup`)
      .send({ challengeToken: first.body.challengeToken })
      .expect(200);
    const enabled = await request(server)
      .post(`${API}/auth/2fa/enable`)
      .send({
        challengeToken: first.body.challengeToken,
        code: codeFor(setup.body.secret),
      })
      .expect(200);
    return {
      secret: setup.body.secret as string,
      recoveryCodes: enabled.body.recoveryCodes as string[],
    };
  };

  it('un rol sin la exigencia entra directo con contraseña', async () => {
    const reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    expect(reception.token).toBeTruthy();
  });

  it('primer ingreso: la contraseña sola NO da sesión; pide configurar la app', async () => {
    const { nick } = await newDoctor();
    const res = await login(nick).expect(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.twoFactor).toBe('setup');

    // el challenge no sirve como sesión
    await request(server)
      .get(`${API}/auth/profile`)
      .set(auth(res.body.challengeToken))
      .expect(401);
  });

  it('alta completa: QR, primer código, sesión y 8 códigos de recuperación; el secreto se guarda cifrado', async () => {
    const { nick, userId } = await newDoctor();
    const first = await login(nick).expect(200);
    const setup = await request(server)
      .post(`${API}/auth/2fa/setup`)
      .send({ challengeToken: first.body.challengeToken })
      .expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/.+secret=/);

    const [row] = await dataSource.query(
      'SELECT two_factor_secret AS s FROM users WHERE id_user = ?',
      [userId],
    );
    expect(row.s).not.toContain(setup.body.secret);

    await request(server)
      .post(`${API}/auth/2fa/enable`)
      .send({ challengeToken: first.body.challengeToken, code: '000000' })
      .expect(401);

    const enabled = await request(server)
      .post(`${API}/auth/2fa/enable`)
      .send({
        challengeToken: first.body.challengeToken,
        code: codeFor(setup.body.secret),
      })
      .expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(8);
    const profile = await request(server)
      .get(`${API}/auth/profile`)
      .set(auth(enabled.body.token))
      .expect(200);
    expect(profile.body.twoFactorEnabled).toBe(true);
    // nunca se devuelve el secreto ni las huellas
    expect(JSON.stringify(profile.body)).not.toMatch(/secret|recovery/i);
  });

  it('ingresos siguientes: pide el código; un código no se puede usar dos veces', async () => {
    const { nick } = await newDoctor();
    const { secret } = await enroll(nick);

    const second = await login(nick).expect(200);
    expect(second.body.twoFactor).toBe('verify');
    // el del enable (paso actual) ya se usó: se prueba con el siguiente
    const next = codeFor(secret, 1);
    const ok = await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: second.body.challengeToken, code: next })
      .expect(200);
    await request(server)
      .get(`${API}/auth/profile`)
      .set(auth(ok.body.token))
      .expect(200);

    const third = await login(nick).expect(200);
    await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: third.body.challengeToken, code: next })
      .expect(401);
  });

  it('un código de recuperación sirve una sola vez', async () => {
    const { nick } = await newDoctor();
    const { recoveryCodes } = await enroll(nick);

    const a = await login(nick).expect(200);
    await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({
        challengeToken: a.body.challengeToken,
        code: recoveryCodes[0].toLowerCase(),
      })
      .expect(200);

    const b = await login(nick).expect(200);
    await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: b.body.challengeToken, code: recoveryCodes[0] })
      .expect(401);
  });

  it('los códigos incorrectos cuentan para el bloqueo de la cuenta', async () => {
    const { nick, userId } = await newDoctor();
    const { secret } = await enroll(nick);
    const challenge = (await login(nick).expect(200)).body.challengeToken;
    for (let i = 0; i < 10; i++) {
      clearRateLimits();
      await request(server)
        .post(`${API}/auth/2fa/verify`)
        .send({ challengeToken: challenge, code: String(100000 + i) })
        .expect(401);
    }
    clearRateLimits();
    const locked = await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: challenge, code: codeFor(secret, 1) })
      .expect(401);
    expect(locked.body.message).toMatch(/bloqueada/);
    const [log] = await dataSource.query(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'LOGIN' AND result = 'DENIED' AND resource_id = ? AND reason LIKE 'Código de verificación incorrecto%'",
      [String(userId)],
    );
    expect(Number(log.n)).toBe(10);
  });

  it('challenge alterado, inventado o de otra etapa → 401', async () => {
    const { nick } = await newDoctor();
    const setupChallenge = (await login(nick).expect(200)).body
      .challengeToken as string;
    // un challenge de "configurar" no sirve para "verificar"
    await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: setupChallenge, code: '123456' })
      .expect(401);
    const tampered =
      setupChallenge.slice(0, -3) +
      (setupChallenge.endsWith('a') ? 'bbb' : 'aaa');
    await request(server)
      .post(`${API}/auth/2fa/setup`)
      .send({ challengeToken: tampered })
      .expect(401);
    // una SESIÓN no sirve como challenge
    await request(server)
      .post(`${API}/auth/2fa/setup`)
      .send({ challengeToken: admin.token })
      .expect(401);
  });

  it('quien ya la activó la sigue necesitando aunque se saque la exigencia a su rol', async () => {
    const { nick } = await newDoctor();
    await enroll(nick);
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ twoFactorRoles: [] })
      .expect(200);
    try {
      const res = await login(nick).expect(200);
      expect(res.body.twoFactor).toBe('verify');
    } finally {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ twoFactorRoles: ['MEDICO'] })
        .expect(200);
    }
  });

  it('el admin reinicia la de otro (celular perdido) y la vuelve a configurar; la propia no', async () => {
    const { nick, userId } = await newDoctor();
    await enroll(nick);
    await request(server)
      .patch(`${API}/auth/reiniciar-2fa/${userId}`)
      .set(auth(admin.token))
      .expect(200);
    expect((await login(nick).expect(200)).body.twoFactor).toBe('setup');

    await request(server)
      .patch(`${API}/auth/reiniciar-2fa/${admin.userId}`)
      .set(auth(admin.token))
      .expect(400);

    const reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    await request(server)
      .patch(`${API}/auth/reiniciar-2fa/${userId}`)
      .set(auth(reception.token))
      .expect(403);
  });

  it('queda en la auditoría: activación, ingreso con 2.º paso y reinicio', async () => {
    const { nick, userId } = await newDoctor();
    const { secret } = await enroll(nick);
    const c = (await login(nick).expect(200)).body.challengeToken;
    await request(server)
      .post(`${API}/auth/2fa/verify`)
      .send({ challengeToken: c, code: codeFor(secret, 1) })
      .expect(200);
    await request(server)
      .patch(`${API}/auth/reiniciar-2fa/${userId}`)
      .set(auth(admin.token))
      .expect(200);

    const rows: { action: string; metadata: string | null }[] =
      await dataSource.query(
        'SELECT action, metadata FROM audit_logs WHERE resource_type = ? AND resource_id = ? ORDER BY id',
        ['user', String(userId)],
      );
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'TWO_FACTOR_ENABLE',
        'LOGIN',
        'TWO_FACTOR_RESET',
      ]),
    );
    expect(
      rows.some(
        (r) =>
          r.action === 'LOGIN' && JSON.stringify(r.metadata).includes('app'),
      ),
    ).toBe(true);
  });

  it('configuración: solo roles válidos', async () => {
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ twoFactorRoles: ['SUPERADMIN'] })
      .expect(400);
    const res = await request(server)
      .get(`${API}/admin/settings`)
      .set(auth(admin.token))
      .expect(200);
    expect(res.body.twoFactorRoles).toEqual(['MEDICO']);
  });
});
