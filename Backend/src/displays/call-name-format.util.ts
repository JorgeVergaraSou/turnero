import { CallNameFormat } from '@/common/enums/call-name-format.enum';

export interface CallNameInput {
  firstName: string;
  lastName: string;
  /** código del turno (10 caracteres) */
  code: string;
}

export interface FormattedCallName {
  /** lo que se lee en la pantalla */
  displayName: string;
  /** lo que dice la voz (difiere solo en CODE: se deletrea) */
  spokenName: string;
}

/** Misma agrupación que ve el paciente en su comprobante: "ABCDE FGHIJ". */
const groupCode = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`;

/** "ABCDE FGHIJ" → "A B C D E, F G H I J": cada carácter suelto y una pausa entre grupos. */
const spellCode = (code: string) =>
  [code.slice(0, 5), code.slice(5)]
    .map((group) => group.split('').join(' '))
    .join(', ');

/**
 * Único lugar donde se decide qué se muestra y qué se dice de un paciente
 * al llamarlo. Es lo que sale por el stream: cualquier dato que no esté
 * acá no llega a la TV.
 */
export function formatCallName(
  format: CallNameFormat,
  { firstName, lastName, code }: CallNameInput,
): FormattedCallName {
  const first = firstName.trim();
  const last = lastName.trim();
  switch (format) {
    case CallNameFormat.CODE:
      return { displayName: groupCode(code), spokenName: spellCode(code) };
    case CallNameFormat.ABBREVIATED: {
      // Array.from separa por caracteres reales (no parte letras con tilde)
      const initial = Array.from(last)[0]?.toUpperCase();
      const name = initial ? `${first} ${initial}.` : first;
      return { displayName: name, spokenName: name };
    }
    default: {
      const name = `${first} ${last}`.trim();
      return { displayName: name, spokenName: name };
    }
  }
}
