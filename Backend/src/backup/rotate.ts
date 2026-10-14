/**
 * Rotación de los respaldos locales (la llama backup.sh después de un
 * respaldo exitoso). Uso:
 *   node dist/backup/rotate.js <carpeta> [--dry-run]
 * Política en variables de entorno: KEEP_DAILY, KEEP_WEEKLY, KEEP_MONTHLY.
 *
 * Solo toca archivos con nombre de respaldo (turnero-*, env-*, uploads-*), y
 * solo borra si el conjunto más nuevo de la carpeta es el último que
 * registró last-success.json: si el último respaldo falló, no se borra nada.
 */
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_RETENTION,
  RetentionPolicy,
  selectBackupsToKeep,
  stampOfBackupFile,
} from './retention';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} tiene que ser un entero mayor o igual a 0`);
  }
  return value;
}

function main(): number {
  const dir = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!dir || !existsSync(dir)) {
    console.error('Uso: rotate.js <carpeta de respaldos> [--dry-run]');
    return 2;
  }
  const policy: RetentionPolicy = {
    daily: intFromEnv('KEEP_DAILY', DEFAULT_RETENTION.daily),
    weekly: intFromEnv('KEEP_WEEKLY', DEFAULT_RETENTION.weekly),
    monthly: intFromEnv('KEEP_MONTHLY', DEFAULT_RETENTION.monthly),
  };

  const files = readdirSync(dir)
    .map((name) => ({ name, stamp: stampOfBackupFile(name) }))
    .filter((f): f is { name: string; stamp: string } => f.stamp !== null);
  const stamps = files.map((f) => f.stamp);
  const newest = [...stamps].sort().reverse()[0];

  // no se borra nada si el último respaldo no quedó registrado como exitoso
  let lastOk: string | null = null;
  try {
    const status = JSON.parse(
      readFileSync(join(dir, 'last-success.json'), 'utf8'),
    );
    lastOk = typeof status.stamp === 'string' ? status.stamp : null;
  } catch {
    lastOk = null;
  }
  if (!newest || lastOk !== newest) {
    console.log(
      'Rotación omitida: el conjunto más nuevo no es el último exitoso.',
    );
    return 0;
  }

  const keep = selectBackupsToKeep(stamps, policy);
  const remove = files.filter((f) => !keep.has(f.stamp));
  for (const f of remove) {
    console.log(`${dryRun ? '[prueba] ' : ''}borrar ${f.name}`);
    if (!dryRun) unlinkSync(join(dir, f.name));
  }
  console.log(
    `Rotación: ${keep.size} conjuntos conservados, ${new Set(remove.map((f) => f.stamp)).size} para borrar.`,
  );
  return 0;
}

process.exitCode = main();
