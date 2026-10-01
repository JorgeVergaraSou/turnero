import { createHmac, randomBytes } from 'crypto';

/**
 * TOTP (RFC 6238), el estándar de Google Authenticator, Microsoft
 * Authenticator, Authy, etc.: código de 6 dígitos que cambia cada 30 s,
 * calculado con HMAC-SHA1 sobre un secreto compartido. Implementado acá
 * (es corto) y verificado contra los vectores de prueba del RFC.
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Secreto base32 inválido');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo: 20 bytes aleatorios (160 bits, lo que recomienda el RFC). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Paso de tiempo actual (cuántos períodos de 30 s pasaron desde 1970). */
export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Código de un paso dado. `digits` configurable solo para los vectores del RFC. */
export function totpAt(secret: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Busca el código en el paso actual y en el anterior/siguiente (tolera
 * hasta 30 s de diferencia de reloj con el celular). Devuelve el paso que
 * coincidió, para impedir reusar el mismo código (ver TwoFactorService).
 */
export function matchTotp(
  secretBase32: string,
  code: string,
  nowMs = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = currentStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (totpAt(secret, step) === code) return step;
  }
  return null;
}

/** URI que codifica el QR (formato "Key Uri" que entienden todas las apps). */
export function otpauthUri(
  issuer: string,
  account: string,
  secretBase32: string,
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
