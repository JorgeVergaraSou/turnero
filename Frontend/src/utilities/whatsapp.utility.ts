/**
 * ¿Sirve este teléfono para armar un enlace de WhatsApp? Misma regla que
 * `toWhatsAppNumber` del backend (Backend/src/appointments/whatsapp.util.ts),
 * que es la que decide en serio: si se cambia una, cambiar la otra.
 * Celular argentino con código de área, p. ej. «11 5555-0000» o «+54 9 11 5555-0000».
 */
export function isWhatsAppPhone(phone: string): boolean {
  if (!/^[\d\s()+.\-/]+$/.test(phone)) return false;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12) {
    for (const areaLength of [2, 3, 4]) {
      if (digits.slice(areaLength, areaLength + 2) === '15') {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  return digits.length === 10 && !digits.startsWith('15') && !digits.startsWith('0');
}
