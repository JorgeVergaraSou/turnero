import {
  parseConfirmToken,
  signConfirmToken,
  verifyConfirmToken,
} from './appointment-confirm-token.util';

describe('enlace de confirmación del recordatorio', () => {
  const OLD = process.env.SECRET_WORD;
  beforeEach(() => {
    process.env.SECRET_WORD = 'clave-de-prueba';
  });
  afterAll(() => {
    process.env.SECRET_WORD = OLD;
  });

  it('el enlace firmado se puede leer y verificar', () => {
    const token = signConfirmToken(42, 'ABCD-1234');
    const parsed = parseConfirmToken(token)!;
    expect(parsed.appointmentId).toBe(42);
    expect(verifyConfirmToken(42, 'ABCD-1234', parsed.signature)).toBe(true);
  });

  it('es estable: el mismo turno da siempre el mismo enlace', () => {
    expect(signConfirmToken(7, 'X')).toBe(signConfirmToken(7, 'X'));
  });

  it('no sirve para otro turno ni con otro código', () => {
    const { signature } = parseConfirmToken(signConfirmToken(42, 'ABCD-1234'))!;
    expect(verifyConfirmToken(43, 'ABCD-1234', signature)).toBe(false);
    expect(verifyConfirmToken(42, 'ABCD-9999', signature)).toBe(false);
  });

  it('una firma alterada o de otro largo no se acepta', () => {
    const { signature } = parseConfirmToken(signConfirmToken(1, 'C'))!;
    const tampered = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
    expect(verifyConfirmToken(1, 'C', tampered)).toBe(false);
    expect(verifyConfirmToken(1, 'C', signature.slice(1))).toBe(false);
    expect(verifyConfirmToken(1, 'C', '')).toBe(false);
  });

  it('cambiar la clave del servidor invalida los enlaces ya enviados', () => {
    const { signature } = parseConfirmToken(signConfirmToken(5, 'C'))!;
    process.env.SECRET_WORD = 'otra-clave';
    expect(verifyConfirmToken(5, 'C', signature)).toBe(false);
  });

  it.each([
    ['', 'vacío'],
    ['42', 'sin firma'],
    ['42.', 'firma vacía'],
    ['.aaaaaaaaaaaaaaaaaaaaaaaa', 'sin id'],
    ['abc.aaaaaaaaaaaaaaaaaaaaaaaa', 'id no numérico'],
    ['42.aaaaaaaaaaaaaaaaaaaaaaa', 'firma corta'],
    ['42.aaaaaaaaaaaaaaaaaaaaaaaaa', 'firma larga'],
    ['42.aaaaaaaaaaaaaaaaaaaaaaa!', 'caracter inválido'],
    ['99999999999.aaaaaaaaaaaaaaaaaaaaaaaa', 'id demasiado largo'],
    ["42.aaaaaaaaaaaaaaaaaaaaaaaa'; DROP TABLE x", 'inyección'],
  ])('%j no es un enlace válido (%s)', (token) => {
    expect(parseConfirmToken(token)).toBeNull();
  });

  it.each([undefined, null, 42, {}, ['42.aaaaaaaaaaaaaaaaaaaaaaaa']])(
    'un valor que no es texto (%j) no es un enlace',
    (value) => {
      expect(parseConfirmToken(value)).toBeNull();
    },
  );

  it('sin clave en el servidor falla en vez de firmar con una clave vacía', () => {
    delete process.env.SECRET_WORD;
    const twoFactor = process.env.TWO_FACTOR_KEY;
    delete process.env.TWO_FACTOR_KEY;
    try {
      expect(() => signConfirmToken(1, 'C')).toThrow(/SECRET_WORD/);
    } finally {
      if (twoFactor !== undefined) process.env.TWO_FACTOR_KEY = twoFactor;
    }
  });
});
