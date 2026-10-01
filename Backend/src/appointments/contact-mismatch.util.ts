/**
 * Diferencias entre el contacto ingresado AL RESERVAR por la web y el
 * legajo del paciente. La reserva pública no verifica identidad: si
 * alguien reserva con un DNI ajeno, lo que escribió no va a coincidir con
 * el legajo. Recepción ve la alerta y el titular del legajo recibe un
 * aviso (ver AppointmentsService.createPublic).
 *
 * Tolerante a lo que un paciente real escribe distinto: tildes, mayúsculas,
 * espacios, un nombre de menos ("Juan" vs "Juan Carlos") y el prefijo del
 * teléfono ("+54 9 11…" vs "11…").
 */
export type ContactField =
  | 'name'
  | 'phone'
  | 'email'
  | 'healthInsurance'
  | 'healthInsuranceNumber';

export interface ContactComparison {
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    /** null = particular; undefined = no se sabe (no se compara) */
    healthInsuranceId?: number | null;
    healthInsuranceNumber?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    healthInsuranceId?: number | null;
    healthInsuranceNumber?: string | null;
  };
}

const words = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);

/** Coinciden si todas las palabras del más corto están en el otro. */
function sameName(a: string, b: string): boolean {
  const [shorter, longer] = [words(a), words(b)].sort(
    (x, y) => x.length - y.length,
  );
  return shorter.length > 0 && shorter.every((w) => longer.includes(w));
}

/** Compara los últimos 8 dígitos (el número sin característica de país). */
function samePhone(a: string, b: string): boolean {
  const digits = (v: string) => v.replace(/\D/g, '').slice(-8);
  return digits(a) === digits(b);
}

export function contactMismatch({
  contact,
  patient,
}: ContactComparison): ContactField[] {
  const fields: ContactField[] = [];
  if (
    !sameName(contact.firstName, patient.firstName) ||
    !sameName(contact.lastName, patient.lastName)
  ) {
    fields.push('name');
  }
  if (!samePhone(contact.phone, patient.phone)) {
    fields.push('phone');
  }
  // un email nuevo donde el legajo no tenía no es sospechoso
  if (
    contact.email &&
    patient.email &&
    contact.email.toLowerCase() !== patient.email.toLowerCase()
  ) {
    fields.push('email');
  }
  // la obra social de un DNI no cambia seguido: si el legajo tiene una y
  // quien reservó declaró otra (o "particular"), es una diferencia. Si el
  // legajo no tiene, no hay contra qué comparar.
  if (
    patient.healthInsuranceId != null &&
    contact.healthInsuranceId !== undefined &&
    contact.healthInsuranceId !== patient.healthInsuranceId
  ) {
    fields.push('healthInsurance');
  }
  // número de afiliado: solo si los dos lo tienen y es la MISMA obra social
  // (con otra, ya se marcó arriba). Sin número en el legajo, no hay contra
  // qué comparar: recepción lo carga.
  const memberNumber = (v?: string | null) =>
    (v ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (
    patient.healthInsuranceId != null &&
    contact.healthInsuranceId === patient.healthInsuranceId &&
    memberNumber(contact.healthInsuranceNumber) &&
    memberNumber(patient.healthInsuranceNumber) &&
    memberNumber(contact.healthInsuranceNumber) !==
      memberNumber(patient.healthInsuranceNumber)
  ) {
    fields.push('healthInsuranceNumber');
  }
  return fields;
}
