/**
 * Límites de columna validados en el backend (guía de seguridad, 6.4).
 *
 * Con MySQL en modo estricto, un texto más largo que su columna no se corta:
 * da error. Si el DTO no lo frena, el atacante obtiene un 500 (o, sin modo
 * estricto, un dato truncado que puede chocar con otro). Esperado: 400 y
 * nada guardado.
 */
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
  unique,
} from './e2e-helpers';
import { Role } from '../src/common/enums/role.enum';

jest.mock('../src/config/mailer', () => ({
  getTransporter: () => ({ sendMail: () => Promise.resolve() }),
}));

describe('Límites de columna en usuarios y login (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;

  const server = () => app.getHttpServer();
  const clearRateLimits = () => app.get(getStorageToken()).storage.clear();
  const long = (n: number) => 'a'.repeat(n);
  const countUsers = async () =>
    Number((await dataSource.query('SELECT COUNT(*) AS n FROM users'))[0].n);

  const validUser = (overrides: Record<string, unknown> = {}) => {
    const suffix = unique('lim');
    return {
      nickUsuario: suffix,
      nombre: 'Prueba',
      apellido: 'Limites',
      role: Role.RECEPCIONISTA,
      email: `${suffix}@example.com`,
      password: 'Passw0rd-e2e',
      ...overrides,
    };
  };

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    dataSource = app.get(DataSource);
    adminToken = (await createUserAndLogin(app, Role.ADMIN)).token;
  });

  beforeEach(clearRateLimits);

  afterAll(async () => {
    await app.close();
  });

  it('el alta de usuario válido sigue funcionando (control)', async () => {
    await request(server())
      .post(`${API}/auth/nuevo-usuario`)
      .set(auth(adminToken))
      .send(validUser())
      .expect(201);
  });

  it.each([
    ['nickUsuario de 61 caracteres', { nickUsuario: long(61) }],
    ['nombre de 61 caracteres', { nombre: long(61) }],
    ['apellido de 61 caracteres', { apellido: long(61) }],
    ['email de 300 caracteres', { email: `${long(290)}@example.com` }],
    ['contraseña de 10.000 caracteres', { password: `A1${long(10000)}` }],
  ])('alta de usuario con %s → 400 y nada guardado', async (_caso, extra) => {
    const before = await countUsers();
    await request(server())
      .post(`${API}/auth/nuevo-usuario`)
      .set(auth(adminToken))
      .send(validUser(extra))
      .expect(400);
    expect(await countUsers()).toBe(before);
  });

  it.each([
    [
      'nickUsuario de 10.000 caracteres',
      { nickUsuario: long(10000), password: 'x' },
    ],
    [
      'contraseña de 10.000 caracteres',
      { nickUsuario: 'alguien', password: long(10000) },
    ],
  ])('login con %s → 400 (no pasa por argon2)', async (_caso, body) => {
    await request(server()).post(`${API}/auth/login`).send(body).expect(400);
  });

  it.each([
    [
      'nick de 10.000 caracteres',
      { nickUsuario: long(10000), email: 'a@example.com' },
    ],
    [
      'email de 300 caracteres',
      { nickUsuario: 'alguien', email: `${long(290)}@example.com` },
    ],
  ])('recuperación con %s → 400', async (_caso, body) => {
    await request(server())
      .post(`${API}/auth/requestResetPassword`)
      .send(body)
      .expect(400);
  });

  it('autoservicio: nombre de 61 caracteres al editar el propio perfil → 400', async () => {
    const me = await createUserAndLogin(app, Role.RECEPCIONISTA);
    await request(server())
      .patch(`${API}/auth/updateUser/${me.userId}`)
      .set(auth(me.token))
      .send({ nombre: long(61), currentPassword: 'Passw0rd-e2e' })
      .expect(400);
  });
});
