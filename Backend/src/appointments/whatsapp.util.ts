/**
 * Enlaces de WhatsApp para los avisos manuales de recepción (`wa.me`): no se
 * manda nada solo, recepción abre el chat con el mensaje ya escrito.
 */

/**
 * Teléfono tal como lo escribió el paciente → número para wa.me
 * (`549` + código de área + número, 13 dígitos), o null si no se puede armar
 * con seguridad. Se asume celular argentino (WhatsApp no anda en fijos).
 *
 * Acepta: «11 5555-0000», «011 15 5555-0000», «(0221) 15-555-0000»,
 * «+54 9 11 5555-0000», «+54 11 5555 0000», «0054 9 11 5555 0000».
 * Rechaza: sin código de área («15 5555-0000», «5555-0000»), muy cortos o muy
 * largos, y los que tienen letras o símbolos raros mezclados con los números.
 */
export function toWhatsAppNumber(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  // solo se aceptan dígitos y los separadores habituales: «llamar a Juan» no es un teléfono
  if (!/^[\d\s()+.\-/]+$/.test(phone)) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);

  // el «15» de los celulares va después del código de área (2 a 4 dígitos)
  if (digits.length === 12) {
    for (const areaLength of [2, 3, 4]) {
      if (digits.slice(areaLength, areaLength + 2) === '15') {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  // 10 dígitos: código de área + número. Ningún código de área empieza con 15.
  if (
    digits.length !== 10 ||
    digits.startsWith('15') ||
    digits.startsWith('0')
  ) {
    return null;
  }
  return `549${digits}`;
}

export function whatsAppUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export interface WhatsAppMessageInput {
  stage: 1 | 2;
  firstName: string;
  clinicName: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:mm' o 'HH:mm:ss' */
  startTime: string;
  officeName: string;
  /** enlace «confirmo que voy» (null si no hay FRONTEND_URL) */
  confirmUrl: string | null;
  /** fecha de hoy ('YYYY-MM-DD') para decir «hoy» en vez de la fecha */
  today: string;
}

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/**
 * Texto del aviso. Lleva SOLO día, hora y consultorio: ni profesional ni
 * especialidad (WhatsApp es un canal que no controlamos y no es el lugar para
 * decir con qué médico se atiende alguien).
 */
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const [y, m, d] = input.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const day =
    input.date === input.today
      ? 'hoy'
      : `el ${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  const time = input.startTime.slice(0, 5);
  const where = `${input.clinicName} (${input.officeName})`;
  const confirm = input.confirmUrl
    ? ` Confirmá que venís acá: ${input.confirmUrl}`
    : '';
  if (input.stage === 2) {
    return `Hola ${input.firstName}, tu turno es ${day} a las ${time} en ${where}.${confirm}`;
  }
  return `Hola ${input.firstName}, te recordamos tu turno ${day} a las ${time} en ${where}.${confirm} Si no podés venir, avisanos así liberamos el horario.`;
}

export interface BookingWhatsAppInput {
  firstName: string;
  clinicName: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:mm' o 'HH:mm:ss' */
  startTime: string;
  officeName: string;
  officeAddress: string;
  /** código tal cual se guarda (sin espacios) */
  code: string;
  /** enlace a «Mi turno» (null si no hay FRONTEND_URL) */
  manageUrl: string | null;
}

/**
 * Mensaje con el código del turno recién reservado. Mismo criterio que los
 * avisos: día, hora y lugar, sin profesional ni especialidad. El código va en
 * dos mitades (como en pantalla) para que sea fácil de leer y dictar.
 */
export function buildBookingWhatsAppMessage(
  input: BookingWhatsAppInput,
): string {
  const [y, m, d] = input.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const day = `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  const code = `${input.code.slice(0, 5)} ${input.code.slice(5)}`;
  const manage = input.manageUrl
    ? ` Para consultarlo o cancelarlo (con tu DNI): ${input.manageUrl}`
    : '';
  return `Hola ${input.firstName}, tu turno en ${input.clinicName} quedó reservado: ${day} a las ${input.startTime.slice(0, 5)} en ${input.officeName} (${input.officeAddress}). Tu código de turno es ${code}.${manage}`;
}
