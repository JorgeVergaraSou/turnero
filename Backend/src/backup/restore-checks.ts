import { readdirSync } from 'fs';
import { join } from 'path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { MedicalConsultationEntity } from '../clinical/entities/medical-consultation.entity';
import { ConsultationStatus } from '../clinical/clinical.enums';
import { computeContentHash } from '../clinical/consultation-view';
import { EXPECTED_TRIGGERS } from './expected-triggers';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

/** Datos que escribe backup.sh en el manifiesto de cada respaldo. */
export interface BackupManifest {
  db?: string;
  /** conteos de las tablas que solo crecen, antes y después del volcado */
  countsBefore?: Record<string, number>;
  countsAfter?: Record<string, number>;
}

const result = (
  name: string,
  status: CheckStatus,
  detail: string,
): CheckResult => ({ name, status, detail });

const rows = async (conn: Connection, sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

/** Timestamps de las migraciones del repositorio (prefijo numérico de cada archivo). */
export function repositoryMigrationTimestamps(
  migrationsDir = join(__dirname, '..', 'migrations'),
): number[] {
  return readdirSync(migrationsDir)
    .map((f) => /^(\d+)-.+\.(ts|js)$/.exec(f)?.[1])
    .filter((t): t is string => !!t)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Las migraciones aplicadas en la base restaurada tienen que ser las del repositorio. */
export async function checkMigrations(
  conn: Connection,
  repoTimestamps: number[],
): Promise<CheckResult> {
  const name = 'Migraciones';
  let applied: number[];
  try {
    applied = (await rows(conn, 'SELECT `timestamp` FROM migrations')).map(
      (r) => Number(r.timestamp),
    );
  } catch {
    return result(name, 'fail', 'No existe la tabla de migraciones.');
  }
  const unknown = applied.filter((t) => !repoTimestamps.includes(t));
  if (unknown.length) {
    return result(
      name,
      'fail',
      `La base tiene migraciones que este código no conoce (${unknown.join(', ')}): es de una versión más nueva.`,
    );
  }
  const pending = repoTimestamps.filter((t) => !applied.includes(t));
  if (pending.length) {
    return result(
      name,
      'warn',
      `Faltan ${pending.length} migraciones por aplicar (el respaldo es de una versión anterior): ${pending.join(', ')}. Correr migration:run después de restaurar.`,
    );
  }
  return result(
    name,
    'ok',
    `${applied.length} migraciones aplicadas, iguales a las del repositorio.`,
  );
}

/** Existen todos los triggers que protegen los registros inmutables. */
export async function checkTriggers(
  conn: Connection,
  database: string,
): Promise<CheckResult> {
  const found = new Set(
    (
      await rows(
        conn,
        'SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
        [database],
      )
    ).map((r) => String(r.name)),
  );
  const missing = EXPECTED_TRIGGERS.filter((t) => !found.has(t));
  const name = 'Triggers de inmutabilidad';
  return missing.length
    ? result(name, 'fail', `Faltan ${missing.length}: ${missing.join(', ')}.`)
    : result(name, 'ok', `Están los ${EXPECTED_TRIGGERS.length} triggers.`);
}

/**
 * Que existan no alcanza: se intenta modificar o borrar registros protegidos
 * y la base tiene que rechazarlo. Todo dentro de una transacción que se
 * revierte siempre: no queda ningún cambio.
 */
export async function checkTriggerBehavior(
  conn: Connection,
): Promise<CheckResult> {
  const name = 'Los triggers funcionan';
  const attempts: { label: string; sql: string; params?: unknown[] }[] = [];

  const [consultation] = await rows(
    conn,
    "SELECT id FROM medical_consultations WHERE status = 'FINALIZADA' LIMIT 1",
  );
  if (consultation) {
    attempts.push({
      label: 'modificar una consulta finalizada',
      sql: "UPDATE medical_consultations SET reason = 'alterado' WHERE id = ?",
      params: [consultation.id],
    });
  }
  const [audit] = await rows(conn, 'SELECT id FROM audit_logs LIMIT 1');
  if (audit) {
    attempts.push({
      label: 'borrar un registro de auditoría',
      sql: 'DELETE FROM audit_logs WHERE id = ?',
      params: [audit.id],
    });
  }
  const [notice] = await rows(
    conn,
    'SELECT version FROM privacy_notices LIMIT 1',
  );
  if (notice) {
    attempts.push({
      label: 'modificar un aviso de privacidad',
      sql: "UPDATE privacy_notices SET summary = 'alterado' WHERE version = ?",
      params: [notice.version],
    });
  }
  if (attempts.length === 0) {
    return result(name, 'warn', 'No hay registros protegidos para probar.');
  }

  const accepted: string[] = [];
  await conn.query('START TRANSACTION');
  try {
    for (const attempt of attempts) {
      try {
        await conn.query(attempt.sql, attempt.params ?? []);
        accepted.push(attempt.label);
      } catch {
        // rechazado: es lo esperado
      }
    }
  } finally {
    await conn.query('ROLLBACK');
  }
  return accepted.length
    ? result(name, 'fail', `La base ACEPTÓ: ${accepted.join('; ')}.`)
    : result(
        name,
        'ok',
        `La base rechazó los ${attempts.length} intentos de alterar registros protegidos.`,
      );
}

/**
 * Las tablas que solo crecen tienen que tener, al restaurar, una cantidad de
 * filas entre la que había antes de empezar el volcado y la de después.
 */
export async function checkCounts(
  conn: Connection,
  manifest: BackupManifest,
): Promise<CheckResult> {
  const name = 'Cantidad de registros';
  const before = manifest.countsBefore;
  const after = manifest.countsAfter;
  if (!before || !after) {
    return result(
      name,
      'warn',
      'El manifiesto no trae conteos: no se pudo comparar.',
    );
  }
  const wrong: string[] = [];
  for (const table of Object.keys(before)) {
    if (!/^[a-z_]+$/.test(table)) {
      wrong.push(`${table} (nombre inválido en el manifiesto)`);
      continue;
    }
    const [{ n }] = await rows(conn, `SELECT COUNT(*) AS n FROM \`${table}\``);
    const count = Number(n);
    if (count < before[table] || count > (after[table] ?? Infinity)) {
      wrong.push(
        `${table}: ${count} (debía estar entre ${before[table]} y ${after[table]})`,
      );
    }
  }
  return wrong.length
    ? result(name, 'fail', wrong.join('; '))
    : result(
        name,
        'ok',
        `${Object.keys(before).length} tablas con la cantidad esperada.`,
      );
}

/**
 * mysqldump restaura con las claves foráneas apagadas: se comprueba que no
 * haya filas huérfanas en NINGUNA relación.
 */
export async function checkOrphans(
  conn: Connection,
  database: string,
): Promise<CheckResult> {
  const name = 'Relaciones entre tablas';
  const fks = await rows(
    conn,
    `SELECT TABLE_NAME AS child, COLUMN_NAME AS childCol,
            REFERENCED_TABLE_NAME AS parent, REFERENCED_COLUMN_NAME AS parentCol
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [database],
  );
  const orphans: string[] = [];
  for (const fk of fks) {
    const [{ n }] = await rows(
      conn,
      `SELECT COUNT(*) AS n FROM \`${fk.child}\` c
        LEFT JOIN \`${fk.parent}\` p ON p.\`${fk.parentCol}\` = c.\`${fk.childCol}\`
       WHERE c.\`${fk.childCol}\` IS NOT NULL AND p.\`${fk.parentCol}\` IS NULL`,
    );
    if (Number(n) > 0)
      orphans.push(`${fk.child}.${fk.childCol} → ${fk.parent} (${n})`);
  }
  return orphans.length
    ? result(
        name,
        'fail',
        `Filas sin su registro padre: ${orphans.join('; ')}.`,
      )
    : result(name, 'ok', `${fks.length} relaciones sin filas huérfanas.`);
}

/**
 * Recalcula la huella (SHA-256) de TODAS las consultas finalizadas con el
 * mismo algoritmo con que se calculó al finalizarlas y la compara con la
 * guardada: prueba que el contenido clínico restaurado es el original.
 */
export async function checkContentHashes(
  dataSource: DataSource,
): Promise<CheckResult> {
  const name = 'Huellas de las consultas finalizadas';
  const repository = dataSource.getRepository(MedicalConsultationEntity);
  const pageSize = 200;
  let checked = 0;
  const mismatched: number[] = [];
  const unsealed: number[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = await repository.find({
      where: { status: ConsultationStatus.FINALIZADA },
      relations: { diagnoses: true, medications: true, studyRequests: true },
      order: { id: 'ASC' },
      skip,
      take: pageSize,
    });
    for (const c of page) {
      checked++;
      if (!c.contentHash || !c.finalizedAt || c.finalizedByUserId === null) {
        unsealed.push(c.id);
        continue;
      }
      if (
        computeContentHash(c, c.finalizedAt, c.finalizedByUserId) !==
        c.contentHash
      ) {
        mismatched.push(c.id);
      }
    }
    if (page.length < pageSize) break;
  }
  if (unsealed.length || mismatched.length) {
    const parts = [
      mismatched.length &&
        `no coincide la huella de las consultas ${mismatched.join(', ')}`,
      unsealed.length && `finalizadas sin huella: ${unsealed.join(', ')}`,
    ].filter(Boolean);
    return result(name, 'fail', `${parts.join('; ')}.`);
  }
  return result(
    name,
    'ok',
    `${checked} consultas finalizadas con la huella correcta.`,
  );
}
