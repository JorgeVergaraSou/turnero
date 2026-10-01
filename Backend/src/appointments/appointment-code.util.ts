import { randomInt } from 'crypto';

/**
 * Alfabeto Crockford base32: sin I, L, O, U — evita confundir 0/O, 1/I/L
 * al dictar o copiar el código, y reduce palabras accidentales.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const APPOINTMENT_CODE_LENGTH = 10;

/**
 * Código de turno: 10 caracteres de un alfabeto de 32 = 50 bits de
 * entropía, generado con `crypto.randomInt` (no Math.random). Aun así,
 * consultar/cancelar exige código + DNI juntos, con rate limiting — el
 * código solo no alcanza.
 */
export function generateAppointmentCode(): string {
  let code = '';
  for (let i = 0; i < APPOINTMENT_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Normaliza lo que tipea el paciente: mayúsculas, sin espacios/guiones,
 * y las letras ambiguas mapeadas como define Crockford (O→0, I/L→1). */
export function normalizeAppointmentCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export const APPOINTMENT_CODE_PATTERN = new RegExp(
  `^[${ALPHABET}]{${APPOINTMENT_CODE_LENGTH}}$`,
);
