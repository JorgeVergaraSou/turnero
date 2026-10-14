import {
  DEFAULT_RETENTION,
  selectBackupsToKeep,
  stampOfBackupFile,
} from './retention';

/** Un respaldo por día a las 03:00, desde `from` durante `days` días. */
function daily(from: string, days: number): string[] {
  const start = Date.UTC(
    +from.slice(0, 4),
    +from.slice(5, 7) - 1,
    +from.slice(8, 10),
  );
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    const iso = d.toISOString();
    return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-030000`;
  });
}

describe('selectBackupsToKeep (rotación de respaldos)', () => {
  it('sin respaldos no conserva nada', () => {
    expect(selectBackupsToKeep([]).size).toBe(0);
  });

  it('con pocos respaldos los conserva todos', () => {
    const stamps = daily('2026-10-01', 5);
    expect(selectBackupsToKeep(stamps).size).toBe(5);
  });

  it('siempre conserva el más nuevo, aunque la política sea 0', () => {
    const stamps = daily('2026-10-01', 5);
    const keep = selectBackupsToKeep(stamps, {
      daily: 0,
      weekly: 0,
      monthly: 0,
    });
    expect(keep.has(stamps[4])).toBe(true);
  });

  it('conserva los últimos 14 días y bastante menos de los 400 que había', () => {
    const stamps = daily('2025-09-01', 400);
    const keep = selectBackupsToKeep(stamps, DEFAULT_RETENTION);
    for (const recent of stamps.slice(-14)) expect(keep.has(recent)).toBe(true);
    expect(keep.size).toBeLessThan(60);
    expect(keep.size).toBeGreaterThan(14);
  });

  it('conserva el más nuevo de cada mes de los últimos 12 y de cada año', () => {
    const stamps = daily('2024-01-01', 900);
    const keep = selectBackupsToKeep(stamps, DEFAULT_RETENTION);
    // el último respaldo de 2024 queda para siempre (uno por año)
    expect(keep.has('20241231-030000')).toBe(true);
    expect(keep.has('20251231-030000')).toBe(true);
    // uno cualquiera de mitad de 2024 se puede borrar
    expect(keep.has('20240615-030000')).toBe(false);
  });

  it('de varios respaldos del mismo día conserva el más nuevo', () => {
    const stamps = ['20261001-030000', '20261001-150000', '20261001-230000'];
    const keep = selectBackupsToKeep(stamps, {
      daily: 1,
      weekly: 0,
      monthly: 0,
    });
    expect([...keep]).toEqual(['20261001-230000']);
  });

  it('ignora sellos con formato inválido (nunca los marca para borrar ni los conserva)', () => {
    const keep = selectBackupsToKeep([
      '20261301-030000',
      'basura',
      '20260230-030000',
      '20261001-030000',
    ]);
    expect([...keep]).toEqual(['20261001-030000']);
  });

  it('semanas ISO: no mezcla la última semana de diciembre con la primera de enero', () => {
    const stamps = [
      '20251229-030000',
      '20251231-030000',
      '20260101-030000',
      '20260102-030000',
    ];
    // 29/12/2025 al 4/1/2026 es la misma semana ISO (2026-W01)
    const keep = selectBackupsToKeep(stamps, {
      daily: 0,
      weekly: 1,
      monthly: 0,
    });
    expect(keep.has('20260102-030000')).toBe(true);
    // el más nuevo de cada año se conserva siempre (2025: el del 31/12)
    expect(keep.has('20251231-030000')).toBe(true);
  });
});

describe('stampOfBackupFile', () => {
  it.each([
    ['turnero-20261007-030000.sql.gz.age', '20261007-030000'],
    ['turnero-20261007-030000.manifest.json', '20261007-030000'],
    ['env-20261007-030000.age', '20261007-030000'],
    ['uploads-20261007-030000.tar.gz.age', '20261007-030000'],
  ])('%s → %s', (name, stamp) => {
    expect(stampOfBackupFile(name)).toBe(stamp);
  });

  it.each([
    'last-success.json',
    'turnero-20261007-030000.sql',
    'otro-20261007-030000.age',
    'turnero-20261307-030000.sql.gz.age',
    '../turnero-20261007-030000.sql.gz.age',
    'turnero-20261007-030000.sql.gz.age.partial',
  ])('%s no es un respaldo (no se toca)', (name) => {
    expect(stampOfBackupFile(name)).toBeNull();
  });
});
