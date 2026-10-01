import { createHash, randomBytes } from 'crypto';

/** Token de pantalla: 256 bits aleatorios, con prefijo para reconocerlo. */
export function generateDisplayToken(): string {
  return `dsp_${randomBytes(32).toString('base64url')}`;
}

/** Lo único que se guarda del token. Un token de 256 bits aleatorios no
 * necesita un hash lento (argon2): no se puede adivinar ni probar por
 * diccionario. */
export function hashDisplayToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Forma válida de un token (se descarta lo demás sin tocar la base). */
export const DISPLAY_TOKEN_PATTERN = /^dsp_[A-Za-z0-9_-]{43}$/;
