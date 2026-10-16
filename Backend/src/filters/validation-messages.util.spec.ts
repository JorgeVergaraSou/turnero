import {
  localizeValidationMessage,
  localizeValidationMessages,
} from './validation-messages.util';

describe('localizeValidationMessage', () => {
  it.each([
    [
      'patient.lastName must be shorter than or equal to 80 characters',
      'El apellido admite hasta 80 caracteres.',
    ],
    [
      'password must be longer than or equal to 8 characters',
      'La contraseña necesita al menos 8 caracteres.',
    ],
    ['email should not be empty', 'El email es obligatorio.'],
    ['phone must be a string', 'El teléfono no es un texto válido.'],
    [
      'professionalId must be an integer number',
      'El profesional tiene que ser un número.',
    ],
    [
      'slotMinutes must not be less than 5',
      'La duración del turno no puede ser menor que 5.',
    ],
    [
      'weekday must not be greater than 7',
      'El día de la semana no puede ser mayor que 7.',
    ],
    ['email must be an email', 'El email no es un email válido.'],
    [
      'isDraft must be a boolean value',
      'El campo «isDraft» tiene que ser sí o no.',
    ],
    [
      'specialtyIds must be an array',
      'El campo «specialtyIds» tiene que ser una lista.',
    ],
    ['property foo should not exist', 'El campo «foo» no se admite.'],
    [
      'patient.property bar should not exist',
      'patient.property bar should not exist',
    ],
    [
      'outcome must be one of the following values: SENT, SKIPPED',
      'El campo «outcome» no es un valor permitido.',
    ],
    [
      'items[0].name must be shorter than or equal to 10 characters',
      'El nombre admite hasta 10 caracteres.',
    ],
  ])('%s', (input, expected) => {
    expect(localizeValidationMessage(input)).toBe(expected);
  });

  it('saca la ruta interna que Nest le antepone a los mensajes de objetos anidados', () => {
    expect(
      localizeValidationMessage(
        'patient.El DNI debe tener entre 5 y 20 letras o números.',
      ),
    ).toBe('El DNI debe tener entre 5 y 20 letras o números.');
    expect(
      localizeValidationMessage('items[2].detail.Ingresá el motivo.'),
    ).toBe('Ingresá el motivo.');
  });

  it('un campo que no conoce se nombra sin exponer la ruta interna completa', () => {
    expect(
      localizeValidationMessage('misc.deep.thing should not be empty'),
    ).toBe('El campo «thing» es obligatorio.');
  });

  it('los mensajes que ya están en castellano no se tocan', () => {
    for (const m of [
      'Ingresá tu nombre.',
      'El DNI debe tener entre 5 y 20 letras o números.',
      'Tenés que aceptar el aviso de privacidad para reservar.',
    ]) {
      expect(localizeValidationMessage(m)).toBe(m);
    }
  });
});

describe('localizeValidationMessages', () => {
  it('traduce listas conservando el orden y lo que no es texto', () => {
    expect(
      localizeValidationMessages([
        'firstName should not be empty',
        'Ingresá tu DNI.',
        42,
      ]),
    ).toEqual(['El nombre es obligatorio.', 'Ingresá tu DNI.', 42]);
  });

  it('acepta un texto suelto, null y objetos sin romperse', () => {
    expect(localizeValidationMessages('name should not be empty')).toBe(
      'El nombre es obligatorio.',
    );
    expect(localizeValidationMessages(null)).toBeNull();
    expect(localizeValidationMessages({ a: 1 })).toEqual({ a: 1 });
    expect(localizeValidationMessages(undefined)).toBeUndefined();
  });
});
