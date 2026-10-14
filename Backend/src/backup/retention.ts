/**
 * Rotación de respaldos: qué conjuntos se conservan y cuáles se pueden borrar.
 *
 * Un "conjunto" es todo lo que se generó en una corrida (base, .env, archivos
 * subidos y manifiesto) y se identifica con su sello AAAAMMDD-HHMMSS. Se
 * conservan: el más nuevo de cada uno de los últimos N días, semanas y meses
 * que tengan respaldos, y el más nuevo de CADA año (esos no se borran nunca).
 * Siempre se conserva el conjunto más nuevo.
 */
export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  daily: 14,
  weekly: 8,
  monthly: 12,
};

export const STAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

/** AAAAMMDD-HHMMSS → fecha (la hora del sello es la del servidor; solo se usa para agrupar). */
function parseStamp(stamp: string): Date | null {
  const m = STAMP_PATTERN.exec(stamp);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // descarta fechas imposibles (mes 13, 31 de febrero)
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
}

/** Semana ISO (el lunes es el primer día): 'AAAA-Www'. */
function isoWeekKey(date: Date): string {
  const t = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** El más nuevo de cada grupo, de los `limit` grupos más recientes (limit = null: todos). */
function newestPerGroup(
  stamps: string[],
  keyOf: (date: Date) => string,
  limit: number | null,
): string[] {
  const groups = new Map<string, string>();
  // de más nuevo a más viejo: el primero de cada grupo es el más nuevo
  for (const stamp of [...stamps].sort().reverse()) {
    const date = parseStamp(stamp)!;
    const key = keyOf(date);
    if (!groups.has(key)) groups.set(key, stamp);
  }
  const kept = [...groups.values()];
  return limit === null ? kept : kept.slice(0, Math.max(0, limit));
}

/**
 * Sellos a conservar. Los sellos que no tienen el formato esperado se
 * ignoran (nunca se tocan): `selectBackupsToKeep` solo habla de los válidos.
 */
export function selectBackupsToKeep(
  stamps: string[],
  policy: RetentionPolicy = DEFAULT_RETENTION,
): Set<string> {
  const valid = [...new Set(stamps)].filter((s) => parseStamp(s));
  if (valid.length === 0) return new Set();
  const keep = new Set<string>();
  keep.add([...valid].sort().reverse()[0]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const year = (d: Date) => String(d.getUTCFullYear());
  for (const s of newestPerGroup(valid, day, policy.daily)) keep.add(s);
  for (const s of newestPerGroup(valid, isoWeekKey, policy.weekly)) keep.add(s);
  for (const s of newestPerGroup(valid, month, policy.monthly)) keep.add(s);
  for (const s of newestPerGroup(valid, year, null)) keep.add(s);
  return keep;
}

/** Nombres de archivo de un conjunto: turnero-<sello>.sql.gz.age, env-<sello>.age, etc. */
export const BACKUP_FILE_PATTERN =
  /^(turnero|env|uploads)-(\d{8}-\d{6})\.(sql\.gz\.age|age|tar\.gz\.age|manifest\.json)$/;

/** Sello al que pertenece un archivo de respaldo, o null si no es uno nuestro. */
export function stampOfBackupFile(filename: string): string | null {
  const m = BACKUP_FILE_PATTERN.exec(filename);
  return m && parseStamp(m[2]) ? m[2] : null;
}
