import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
  totpAt,
} from './totp.util';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './secret-box.util';

describe('TOTP (RFC 6238)', () => {
  // Vectores oficiales del RFC 6238, apéndice B (SHA1, 8 dígitos)
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('en t=%p el código es %p', (seconds, expected) => {
    expect(totpAt(rfcSecret, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('base32 ida y vuelta', () => {
    const buffer = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(buffer)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(buffer);
  });

  it('acepta el código actual y los de ±30 s; rechaza los demás', () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 8, 28, 12, 0, 0);
    const step = Math.floor(now / 30000);
    const at = (s: number) => totpAt(base32Decode(secret), s);
    expect(matchTotp(secret, at(step), now)).toBe(step);
    expect(matchTotp(secret, at(step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, at(step + 1), now)).toBe(step + 1);
    // dos minutos atrás: ya no vale (salvo coincidencia 1 en un millón)
    const old = at(step - 4);
    if (![at(step - 1), at(step), at(step + 1)].includes(old)) {
      expect(matchTotp(secret, old, now)).toBeNull();
    }
    expect(matchTotp(secret, '12a456', now)).toBeNull();
    expect(matchTotp(secret, '', now)).toBeNull();
  });

  it('arma la URI del QR', () => {
    expect(otpauthUri('Consultorio', 'admin', 'ABC')).toBe(
      'otpauth://totp/Consultorio%3Aadmin?secret=ABC&issuer=Consultorio&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('cifrado del secreto y códigos de recuperación', () => {
  beforeAll(() => {
    process.env.SECRET_WORD =
      process.env.SECRET_WORD || 'clave-de-prueba-para-tests';
  });

  it('cifra y descifra; el cifrado no contiene el secreto y cambia cada vez', () => {
    const secret = generateTotpSecret();
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toContain(secret);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(secret);
  });

  it('un cifrado alterado no se descifra', () => {
    const boxed = encryptSecret('SECRETO');
    const [iv, tag, data] = boxed.split('.');
    const tampered = [
      iv,
      tag,
      data.slice(0, -2) + (data.endsWith('A') ? 'BB' : 'AA'),
    ].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('genera 8 códigos distintos y la huella ignora guiones y mayúsculas', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(hashRecoveryCode(codes[0])).toBe(
      hashRecoveryCode(codes[0].replace('-', '').toLowerCase()),
    );
    expect(hashRecoveryCode(codes[0])).not.toBe(hashRecoveryCode(codes[1]));
  });
});
