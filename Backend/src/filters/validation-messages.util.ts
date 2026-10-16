/**
 * Mensajes de validación en castellano. class-validator devuelve en inglés
 * ("patient.lastName must be shorter than or equal to 80 characters") los
 * campos que no tienen un mensaje propio; sin esto, ese texto llegaba tal cual
 * a la persona y mostraba nombres internos de campos. Los mensajes que ya
 * están en castellano no coinciden con ningún patrón y pasan sin cambios.
 */

/** Cómo se nombra cada campo ante el usuario (con artículo). */
const FIELD_LABELS: Record<string, string> = {
  firstName: 'El nombre',
  lastName: 'El apellido',
  nombre: 'El nombre',
  apellido: 'El apellido',
  documentNumber: 'El DNI',
  phone: 'El teléfono',
  email: 'El email',
  birthDate: 'La fecha de nacimiento',
  healthInsuranceId: 'La obra social',
  healthInsuranceNumber: 'El número de afiliado',
  password: 'La contraseña',
  nickUsuario: 'El usuario',
  name: 'El nombre',
  address: 'La dirección',
  date: 'La fecha',
  startTime: 'La hora de inicio',
  endTime: 'La hora de fin',
  reason: 'El motivo',
  summary: 'El aviso breve',
  policy: 'La política',
  content: 'El contenido',
  description: 'La descripción',
  licenseNumber: 'La matrícula',
  clinicName: 'El nombre del consultorio',
  contactPhone: 'El teléfono de contacto',
  professionalId: 'El profesional',
  specialtyId: 'La especialidad',
  patientId: 'El paciente',
  privacyVersion: 'La aceptación del aviso de privacidad',
  slotMinutes: 'La duración del turno',
  weekday: 'El día de la semana',
  // historia clínica
  weightKg: 'El peso',
  heightCm: 'La talla',
  systolicBp: 'La tensión sistólica',
  diastolicBp: 'La tensión diastólica',
  heartRate: 'La frecuencia cardíaca',
  temperatureC: 'La temperatura',
  oxygenSaturation: 'La saturación de oxígeno',
  anamnesis: 'La anamnesis',
  physicalExam: 'El examen físico',
  evolution: 'La evolución',
  indications: 'Las indicaciones',
  observations: 'Las observaciones',
  drugName: 'El nombre del medicamento',
  dose: 'La dosis',
  frequency: 'La frecuencia',
  duration: 'La duración',
  notes: 'Las notas',
  codeSystem: 'El sistema de codificación',
  code: 'El código',
};

/** "patient.lastName" → "El apellido"; lo que no se conoce, "El campo «x»". */
function label(path: string): string {
  const last = path
    .split('.')
    .pop()!
    .replace(/\[\d+\]/g, '');
  return FIELD_LABELS[last] ?? `El campo «${last}»`;
}

const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^(.+) must be shorter than or equal to (\d+) characters?$/,
    (m) => `${label(m[1])} admite hasta ${m[2]} caracteres.`,
  ],
  [
    /^(.+) must be longer than or equal to (\d+) characters?$/,
    (m) => `${label(m[1])} necesita al menos ${m[2]} caracteres.`,
  ],
  [/^(.+) should not be empty$/, (m) => `${label(m[1])} es obligatorio.`],
  [/^(.+) must be a string$/, (m) => `${label(m[1])} no es un texto válido.`],
  [
    /^(.+) must be (an integer number|a number conforming to the specified constraints|a number string|a positive number|a negative number)$/,
    (m) => `${label(m[1])} tiene que ser un número.`,
  ],
  [
    /^(.+) must not be less than (-?\d+(?:\.\d+)?)$/,
    (m) => `${label(m[1])} no puede ser menor que ${m[2]}.`,
  ],
  [
    /^(.+) must not be greater than (-?\d+(?:\.\d+)?)$/,
    (m) => `${label(m[1])} no puede ser mayor que ${m[2]}.`,
  ],
  [
    /^(.+) must be one of the following values: .+$/,
    (m) => `${label(m[1])} no es un valor permitido.`,
  ],
  [/^(.+) must be an email$/, (m) => `${label(m[1])} no es un email válido.`],
  [
    /^(.+) must be a boolean value$/,
    (m) => `${label(m[1])} tiene que ser sí o no.`,
  ],
  [/^(.+) must be an array$/, (m) => `${label(m[1])} tiene que ser una lista.`],
  [
    /^(.+) must contain no more than (\d+) elements$/,
    (m) => `${label(m[1])} admite hasta ${m[2]} elementos.`,
  ],
  [
    /^(.+) must contain at least (\d+) elements$/,
    (m) => `${label(m[1])} necesita al menos ${m[2]} elementos.`,
  ],
  [
    /^(.+) must be an object$/,
    (m) => `${label(m[1])} no tiene el formato esperado.`,
  ],
  [
    /^property (.+) should not exist$/,
    (m) => `El campo «${m[1].split('.').pop()}» no se admite.`,
  ],
];

/**
 * Los mensajes de objetos anidados llegan con la ruta interna delante, aun
 * los que ya están en castellano: "patient.El DNI debe tener…". Se la saca.
 */
const PATH_PREFIX =
  /^(?:[a-z][A-Za-z0-9_]*(?:\[\d+\])?\.)+(?=[A-ZÁÉÍÓÚÜÑ¿¡"«])/;

export function localizeValidationMessage(input: string): string {
  const message = input.replace(PATH_PREFIX, '');
  for (const [pattern, build] of RULES) {
    const match = pattern.exec(message);
    if (match) return build(match);
  }
  return message;
}

/** Aplica la traducción a un mensaje o a una lista de mensajes (lo demás pasa igual). */
export function localizeValidationMessages<T>(message: T): T {
  if (typeof message === 'string') {
    return localizeValidationMessage(message) as T;
  }
  if (Array.isArray(message)) {
    return message.map((m) =>
      typeof m === 'string' ? localizeValidationMessage(m) : m,
    ) as T;
  }
  return message;
}
