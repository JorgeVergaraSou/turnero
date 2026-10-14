/**
 * Respaldos: la lista de triggers que exige la verificación de restauración
 * tiene que ser EXACTAMENTE la que crean las migraciones. Si una migración
 * nueva agrega (o saca) un trigger y nadie actualiza expected-triggers.ts, la
 * verificación de un respaldo bueno fallaría (o no notaría un trigger perdido).
 * También prueba los controles de restore-checks contra la base real.
 */
import * as mysql from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { prepareE2eDatabase } from './e2e-helpers';
import { EXPECTED_TRIGGERS } from '../src/backup/expected-triggers';
import {
  checkContentHashes,
  checkMigrations,
  checkOrphans,
  checkTriggerBehavior,
  checkTriggers,
  repositoryMigrationTimestamps,
} from '../src/backup/restore-checks';
import { buildDatabaseOptions } from '../src/config/database.config';
import { join } from 'path';

describe('Respaldos: controles de restauración contra la base real (e2e)', () => {
  let conn: mysql.Connection;
  let dataSource: DataSource;
  let database: string;

  beforeAll(async () => {
    await prepareE2eDatabase();
    database = process.env.DB_NAME!;
    const user = process.env.MIGRATION_DB_USER || process.env.DB_USERNAME;
    const password =
      process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD;
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user,
      password,
      database,
      timezone: '-03:00',
    });
    dataSource = new DataSource({
      ...buildDatabaseOptions({
        DB_HOST: process.env.DB_HOST || '127.0.0.1',
        DB_PORT: process.env.DB_PORT,
        DB_USERNAME: user,
        DB_PASSWORD: password,
        DB_NAME: database,
      }),
      entities: [join(__dirname, '..', 'src', '**', '*.entity.ts')],
    });
    await dataSource.initialize();
  }, 120000);

  afterAll(async () => {
    await dataSource?.destroy();
    await conn?.end();
  });

  it('EXPECTED_TRIGGERS es exactamente la lista de triggers de la base migrada', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
      [database],
    );
    const real = rows.map((r) => String(r.name)).sort();
    expect([...EXPECTED_TRIGGERS].sort()).toEqual(real);
  });

  it('las migraciones del repositorio están todas aplicadas', async () => {
    const result = await checkMigrations(conn, repositoryMigrationTimestamps());
    expect(result).toMatchObject({ status: 'ok' });
  });

  it('checkTriggers y checkTriggerBehavior pasan en una base sana', async () => {
    expect(await checkTriggers(conn, database)).toMatchObject({
      status: 'ok',
    });
    const behavior = await checkTriggerBehavior(conn);
    expect(behavior.status).toBe('ok');
    expect(behavior.detail).toMatch(/rechazó los \d+ intentos/);
  });

  it('checkTriggerBehavior no deja ningún cambio en la base (siempre revierte)', async () => {
    const count = async () =>
      JSON.stringify(
        (
          await conn.query<mysql.RowDataPacket[]>(
            `SELECT (SELECT COUNT(*) FROM audit_logs) a,
                    (SELECT COUNT(*) FROM privacy_notices) p,
                    (SELECT MD5(GROUP_CONCAT(reason)) FROM medical_consultations) c`,
          )
        )[0],
      );
    const before = await count();
    await checkTriggerBehavior(conn);
    expect(await count()).toBe(before);
  });

  it('las huellas de todas las consultas finalizadas se recalculan y coinciden', async () => {
    const result = await checkContentHashes(dataSource);
    expect(result.status).toBe('ok');
    expect(result.detail).toMatch(/^\d+ consultas finalizadas/);
  });

  it('no hay filas huérfanas en ninguna relación', async () => {
    expect(await checkOrphans(conn, database)).toMatchObject({ status: 'ok' });
  });
});
