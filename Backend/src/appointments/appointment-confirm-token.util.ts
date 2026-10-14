import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Enlace de "confirmo que voy" que llega en el recordatorio. El enlace es
 * `<id>.<firma>`: la firma es un HMAC del id y el código del turno con una
 * clave derivada de SECRET_WORD (o TWO_FACTOR_KEY), así que no se puede
 * armar uno sin conocer la clave ni adivinar el de otro turno, y no hace falta
 * guardar nada en la base. Solo sirve para CONFIRMAR asistencia (una acción de
 * bajo riesgo); para cancelar sigue haciendo falta el código y el DNI.
 */
const SIGNATURE_LENGTH = 24;
const TOKEN_PATTERN = /^(\d{1,10})\.([A-Za-z0-9_-]{24})$/;

function key(): Buffer {
  const base = process.env.SECRET_WORD || process.env.TWO_FACTOR_KEY;
  if (!base) throw new Error('Falta SECRET_WORD o TWO_FACTOR_KEY');
  return createHmac('sha256', base).update('appointment-confirm-link').digest();
}

function sign(appointmentId: number, code: string): string {
  return createHmac('sha256', key())
    .update(`${appointmentId}:${code}`)
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH);
}

export function signConfirmToken(appointmentId: number, code: string): string {
  return `${appointmentId}.${sign(appointmentId, code)}`;
}

/** Id del turno que dice tener el enlace, o null si no tiene el formato. */
export function parseConfirmToken(
  token: unknown,
): { appointmentId: number; signature: string } | null {
  if (typeof token !== 'string') return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  return { appointmentId: Number(match[1]), signature: match[2] };
}

/** ¿La firma corresponde a ese turno? Comparación en tiempo constante. */
export function verifyConfirmToken(
  appointmentId: number,
  code: string,
  signature: string,
): boolean {
  const expected = Buffer.from(sign(appointmentId, code));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
