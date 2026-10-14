/**
 * Verifica una base restaurada desde un respaldo. Lo llama restore.sh (y se
 * puede correr solo). Termina con código 0 si todo está bien (advertencias
 * incluidas) y con 1 si algún control falla. Uso:
 *   node dist/backup/verify-restore.js
 * Variables: VERIFY_DB_HOST, VERIFY_DB_PORT, VERIFY_DB_USER,
 * VERIFY_DB_PASSWORD, VERIFY_DB_NAME y, opcional, VERIFY_MANIFEST (ruta del
 * manifiesto .json del respaldo, para comparar cantidades de registros).
 *
 * Es de solo lectura: lo único que "escribe" son intentos de alterar
 * registros protegidos, dentro de una transacción que siempre se revierte.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import {
  BackupManifest,
  CheckResult,
  checkContentHashes,
  checkCounts,
  checkMigrations,
  checkOrphans,
  checkTriggerBehavior,
  checkTriggers,
  repositoryMigrationTimestamps,
} from './restore-checks';

const ICON = { ok: 'OK   ', warn: 'AVISO', fail: 'FALLA' } as const;

async function main(): Promise<number> {
  const database = process.env.VERIFY_DB_NAME;
  if (!database) {
    console.error('Falta VERIFY_DB_NAME (la base restaurada a verificar).');
    return 2;
  }
  const connection = {
    host: process.env.VERIFY_DB_HOST || '127.0.0.1',
    port: Number(process.env.VERIFY_DB_PORT) || 3306,
    user: process.env.VERIFY_DB_USER,
    password: process.env.VERIFY_DB_PASSWORD,
    database,
  };

  let manifest: BackupManifest = {};
  if (process.env.VERIFY_MANIFEST) {
    manifest = JSON.parse(readFileSync(process.env.VERIFY_MANIFEST, 'utf8'));
  }

  const conn = await createConnection({ ...connection, timezone: '-03:00' });
  const dataSource = new DataSource({
    ...buildDatabaseOptions({
      DB_HOST: connection.host,
      DB_PORT: connection.port,
      DB_USERNAME: connection.user,
      DB_PASSWORD: connection.password,
      DB_NAME: database,
    }),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  });

  const results: CheckResult[] = [];
  const run = async (fn: () => Promise<CheckResult>, name: string) => {
    try {
      results.push(await fn());
    } catch (error) {
      results.push({
        name,
        status: 'fail',
        detail: `No se pudo comprobar: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  try {
    await dataSource.initialize();
    await run(
      () => checkMigrations(conn, repositoryMigrationTimestamps()),
      'Migraciones',
    );
    await run(() => checkTriggers(conn, database), 'Triggers de inmutabilidad');
    await run(() => checkTriggerBehavior(conn), 'Los triggers funcionan');
    await run(
      () => checkContentHashes(dataSource),
      'Huellas de las consultas finalizadas',
    );
    await run(() => checkCounts(conn, manifest), 'Cantidad de registros');
    await run(() => checkOrphans(conn, database), 'Relaciones entre tablas');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
    await conn.end();
  }

  console.log(`\nVerificación de la base restaurada "${database}":`);
  for (const r of results)
    console.log(`  [${ICON[r.status]}] ${r.name}: ${r.detail}`);
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(
    failed
      ? `\nRESULTADO: FALLÓ (${failed} controles). NO usar esta restauración sin revisar.`
      : '\nRESULTADO: TODO BIEN.',
  );
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(
      'Error al verificar:',
      error instanceof Error ? error.message : error,
    );
    process.exit(2);
  },
);
