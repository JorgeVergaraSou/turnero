import {
  buildWhatsAppMessage,
  toWhatsAppNumber,
  whatsAppUrl,
} from './whatsapp.util';

describe('toWhatsAppNumber (teléfonos argentinos → wa.me)', () => {
  it.each([
    ['11 5555-0000', '5491155550000'],
    ['1155550000', '5491155550000'],
    ['011 15 5555-0000', '5491155550000'],
    ['(011) 15-5555-0000', '5491155550000'],
    ['+54 9 11 5555-0000', '5491155550000'],
    ['+54 11 5555 0000', '5491155550000'],
    ['0054 9 11 5555 0000', '5491155550000'],
    ['54 9 11 5555 0000', '5491155550000'],
    ['0221 15 555-0000', '5492215550000'],
    ['2494 15 531999', '5492494531999'],
    ['  11.5555.0000  ', '5491155550000'],
  ])('%s → %s', (input, expected) => {
    expect(toWhatsAppNumber(input)).toBe(expected);
  });

  it.each([
    ['15 5555-0000', 'sin código de área, con el 15'],
    ['5555-0000', 'sin código de área'],
    ['555', 'muy corto'],
    ['', 'vacío'],
    ['11 5555-0000 1234', 'muy largo'],
    ['llamar a Juan 1155550000', 'con letras'],
    ['11 5555-0000; DROP TABLE', 'con símbolos raros'],
    ['0000000000', 'ceros'],
    ['+1 415 555 0000', 'otro país'],
  ])('%s se rechaza (%s)', (input) => {
    expect(toWhatsAppNumber(input)).toBeNull();
  });

  it.each([null, undefined])('%s → null', (value) => {
    expect(toWhatsAppNumber(value)).toBeNull();
  });
});

describe('whatsAppUrl', () => {
  it('arma el enlace con el texto codificado', () => {
    expect(whatsAppUrl('5491155550000', 'Hola María: ¿venís? & más')).toBe(
      'https://wa.me/5491155550000?text=Hola%20Mar%C3%ADa%3A%20%C2%BFven%C3%ADs%3F%20%26%20m%C3%A1s',
    );
  });
});

describe('buildWhatsAppMessage', () => {
  const base = {
    firstName: 'Mariana',
    clinicName: 'Consultorio Central',
    date: '2026-10-15',
    startTime: '10:30:00',
    officeName: 'Consultorio 1',
    confirmUrl: 'https://turnos.example.com/confirmar?t=1.abc',
    today: '2026-10-14',
  };

  it('primer aviso: dice día, hora y lugar, y lleva el enlace', () => {
    const text = buildWhatsAppMessage({ ...base, stage: 1 });
    expect(text).toContain('Hola Mariana');
    expect(text).toContain('el jueves 15/10 a las 10:30');
    expect(text).toContain('Consultorio Central (Consultorio 1)');
    expect(text).toContain('https://turnos.example.com/confirmar?t=1.abc');
    expect(text).toMatch(/liberamos el horario/);
  });

  it('segundo aviso del mismo día: dice «hoy»', () => {
    const text = buildWhatsAppMessage({
      ...base,
      stage: 2,
      date: '2026-10-14',
    });
    expect(text).toContain('tu turno es hoy a las 10:30');
  });

  it('sin enlace de confirmación el mensaje sale igual', () => {
    const text = buildWhatsAppMessage({ ...base, stage: 2, confirmUrl: null });
    expect(text).not.toMatch(/Confirmá que venís/);
    expect(text).toContain('Hola Mariana');
  });

  it('nunca menciona profesional ni especialidad (el texto ni los recibe)', () => {
    expect(Object.keys(base)).not.toEqual(
      expect.arrayContaining(['professionalName', 'specialtyName']),
    );
  });
});
