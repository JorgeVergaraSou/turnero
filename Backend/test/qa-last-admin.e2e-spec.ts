/**
 * QA: "el sistema nunca queda sin administrador activo", también cuando dos
 * administradores se dan de baja (o se quitan el rol) a la vez. Antes los dos
 * pasaban la revisión "queda otro administrador" y los dos se iban: 0 admins.
 *
 * Corre en una base propia y vacía, para controlar exactamente cuántos
 * administradores hay (en la base compartida de los otros tests hay cientos).
 */
process.env.E2E_DB_NAME = 'turnero_e2e_lastadmin';

import { INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
} from './e2e-helpers';
import { Role } from '../src/common/enums/role.enum';

describe('QA: nunca sin administrador (e2e, base aislada)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;

  beforeAll(async () => {
    await prepareE2eDatabase();
    // el usuario de la app (sin DDL, igual que en producción) tiene que poder usar esta base nueva
    const root = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.MIGRATION_DB_USER || process.env.DB_USERNAME,
      password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    });
    await root.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON \`turnero_e2e_lastadmin\`.* TO ?@'localhost'`,
      [process.env.DB_USERNAME],
    );
    await root.end();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());

  afterAll(async () => {
    await app.close();
    // la base de esta prueba es descartable
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.MIGRATION_DB_USER || process.env.DB_USERNAME,
      password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    });
    await connection.query('DROP DATABASE IF EXISTS `turnero_e2e_lastadmin`');
    await connection.end();
  });

  /** Deja exactamente dos administradores activos (los que se crean ahora). */
  async function twoAdmins() {
    const a = await createUserAndLogin(app, Role.ADMIN);
    const b = await createUserAndLogin(app, Role.ADMIN);
    await dataSource.query(
      "UPDATE users SET deleted_at = NOW() WHERE role = 'ADMIN' AND id_user NOT IN (?, ?) AND deleted_at IS NULL",
      [a.userId, b.userId],
    );
    return { a, b };
  }
  const activeAdmins = async () =>
    Number(
      (
        await dataSource.query(
          "SELECT COUNT(*) n FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL",
        )
      )[0].n,
    );

  it('dos administradores dándose de baja entre sí a la vez: queda uno (5 rondas)', async () => {
    for (let round = 0; round < 5; round++) {
      const { a, b } = await twoAdmins();
      const results = await Promise.all([
        request(server)
          .delete(`${API}/auth/dar-de-baja-usuario/${b.userId}`)
          .set(auth(a.token)),
        request(server)
          .delete(`${API}/auth/dar-de-baja-usuario/${a.userId}`)
          .set(auth(b.token)),
      ]);
      expect(results.filter((r) => r.status >= 500)).toEqual([]);
      expect(await activeAdmins()).toBe(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    }
  });

  it('dos administradores quitándose el rol entre sí a la vez: queda uno', async () => {
    for (let round = 0; round < 3; round++) {
      const { a, b } = await twoAdmins();
      const results = await Promise.all([
        request(server)
          .patch(`${API}/auth/editar-usuario/${b.userId}`)
          .set(auth(a.token))
          .send({ role: Role.RECEPCIONISTA }),
        request(server)
          .patch(`${API}/auth/editar-usuario/${a.userId}`)
          .set(auth(b.token))
          .send({ role: Role.MEDICO }),
      ]);
      expect(results.filter((r) => r.status >= 500)).toEqual([]);
      expect(await activeAdmins()).toBe(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    }
  });

  it('con tres administradores, dos bajas simultáneas cruzadas no dejan cero', async () => {
    const a = await createUserAndLogin(app, Role.ADMIN);
    const b = await createUserAndLogin(app, Role.ADMIN);
    const c = await createUserAndLogin(app, Role.ADMIN);
    await dataSource.query(
      "UPDATE users SET deleted_at = NOW() WHERE role = 'ADMIN' AND id_user NOT IN (?, ?, ?) AND deleted_at IS NULL",
      [a.userId, b.userId, c.userId],
    );
    const results = await Promise.all([
      request(server)
        .delete(`${API}/auth/dar-de-baja-usuario/${b.userId}`)
        .set(auth(a.token)),
      request(server)
        .delete(`${API}/auth/dar-de-baja-usuario/${c.userId}`)
        .set(auth(a.token)),
      request(server)
        .delete(`${API}/auth/dar-de-baja-usuario/${a.userId}`)
        .set(auth(b.token)),
      request(server)
        .delete(`${API}/auth/dar-de-baja-usuario/${a.userId}`)
        .set(auth(c.token)),
    ]);
    expect(results.filter((r) => r.status >= 500)).toEqual([]);
    expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
  });

  it('una baja normal (queda otro administrador) sigue funcionando', async () => {
    const { a, b } = await twoAdmins();
    await request(server)
      .delete(`${API}/auth/dar-de-baja-usuario/${b.userId}`)
      .set(auth(a.token))
      .expect(200);
    // y el último no se puede dar de baja
    const other = await createUserAndLogin(app, Role.ADMIN);
    await dataSource.query(
      "UPDATE users SET deleted_at = NOW() WHERE role = 'ADMIN' AND id_user NOT IN (?, ?) AND deleted_at IS NULL",
      [a.userId, other.userId],
    );
    await request(server)
      .delete(`${API}/auth/dar-de-baja-usuario/${other.userId}`)
      .set(auth(a.token))
      .expect(200);
    await request(server)
      .delete(`${API}/auth/dar-de-baja-usuario/${a.userId}`)
      .set(auth(other.token))
      .expect(401); // su token ya no vale: lo dieron de baja
  });
});
