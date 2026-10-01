/**
 * Cómo se nombra a un paciente cuando se lo llama a la sala de espera
 * (pantalla y voz). Se aplica en el SERVIDOR: con ABBREVIATED o CODE el
 * nombre completo nunca viaja hacia la pantalla.
 */
export enum CallNameFormat {
  /** "Juan Pérez" */
  FULL = 'FULL',
  /** "Juan P." (más privado: el apellido no sale completo) */
  ABBREVIATED = 'ABBREVIATED',
  /** "K7M2Q 9XW4P" — el código del turno, sin ningún nombre */
  CODE = 'CODE',
}
