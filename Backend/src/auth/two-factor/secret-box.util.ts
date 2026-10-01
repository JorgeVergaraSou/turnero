import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

/**
 * Cifrado del secreto de la verificación en dos pasos (AES-256-GCM): si
 * alguien se lleva la base, no puede generar los códigos de nadie. La
 * clave sale de TWO_FACTOR_KEY o, si no está, de SECRET_WORD (derivada,
 * nunca la misma). Cambiar esa variable invalida los secretos guardados:
 * todos tendrían que volver a configurar la app.
 */
function key(purpose: string): Buffer {
  const base = process.env.TWO_FACTOR_KEY || process.env.SECRET_WORD;
  if (!base) throw new Error('Falta TWO_FACTOR_KEY o SECRET_WORD');
  return createHash('sha256').update(`turnero:${purpose}:${base}`).digest();
}

/** 'iv.tag.cifrado' en base64url */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('totp'), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString('base64url'))
    .join('.');
}

export function decryptSecret(boxed: string): string {
  const [iv, tag, encrypted] = boxed
    .split('.')
    .map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key('totp'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * Huella de un código de recuperación: HMAC con una clave del servidor
 * (con la base sola no se pueden probar códigos por fuerza bruta). Se
 * normaliza: sin guiones ni espacios, en mayúsculas.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHmac('sha256', key('recovery')).update(normalized).digest('hex');
}

/** 8 códigos tipo 'K7Q2M-X9PLA' (50 bits cada uno, sin 0/O ni 1/I). */
export function generateRecoveryCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}
