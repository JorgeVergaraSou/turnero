import { createHash } from 'crypto';
import { computeNoticeHash, normalizeNoticeText } from './privacy-notice.util';

describe('computeNoticeHash (huella del aviso de privacidad)', () => {
  it('es el SHA-256 del par aviso breve + política (misma fórmula que la migración)', () => {
    const expected = createHash('sha256')
      .update(JSON.stringify({ summary: 'resumen', policy: 'política' }))
      .digest('hex');
    expect(computeNoticeHash('resumen', 'política')).toBe(expected);
  });

  it('es estable: el mismo texto da siempre la misma huella', () => {
    expect(computeNoticeHash('a', 'b')).toBe(computeNoticeHash('a', 'b'));
  });

  it('cualquier cambio en el aviso o en la política cambia la huella', () => {
    const base = computeNoticeHash('a', 'b');
    expect(computeNoticeHash('a.', 'b')).not.toBe(base);
    expect(computeNoticeHash('a', 'b.')).not.toBe(base);
  });

  it('no confunde dónde termina cada texto', () => {
    expect(computeNoticeHash('ab', 'c')).not.toBe(computeNoticeHash('a', 'bc'));
  });

  it('tiene 64 caracteres hexadecimales', () => {
    expect(computeNoticeHash('x', 'y')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeNoticeText', () => {
  it('unifica los saltos de línea de Windows y recorta los bordes', () => {
    expect(normalizeNoticeText('  uno\r\ndos\rtres  ')).toBe('uno\ndos\ntres');
  });

  it('un texto con saltos distintos da la misma huella una vez normalizado', () => {
    expect(computeNoticeHash(normalizeNoticeText('a\r\nb'), 'p')).toBe(
      computeNoticeHash(normalizeNoticeText('a\nb'), 'p'),
    );
  });
});
