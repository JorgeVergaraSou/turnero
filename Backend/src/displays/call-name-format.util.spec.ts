import { CallNameFormat } from '@/common/enums/call-name-format.enum';
import { formatCallName } from './call-name-format.util';

const patient = { firstName: 'Juan', lastName: 'Pérez', code: 'K7M2Q9XW4P' };

describe('formatCallName (qué se muestra y qué se dice del paciente)', () => {
  it('FULL: nombre y apellido', () => {
    expect(formatCallName(CallNameFormat.FULL, patient)).toEqual({
      displayName: 'Juan Pérez',
      spokenName: 'Juan Pérez',
    });
  });

  it('ABBREVIATED: nombre e inicial del apellido, sin el apellido completo', () => {
    const result = formatCallName(CallNameFormat.ABBREVIATED, patient);
    expect(result).toEqual({ displayName: 'Juan P.', spokenName: 'Juan P.' });
    expect(JSON.stringify(result)).not.toContain('Pérez');
  });

  it('ABBREVIATED respeta las letras con tilde y pasa la inicial a mayúscula', () => {
    expect(
      formatCallName(CallNameFormat.ABBREVIATED, {
        ...patient,
        lastName: 'ángel',
      }).displayName,
    ).toBe('Juan Á.');
  });

  it('ABBREVIATED sin apellido deja solo el nombre', () => {
    expect(
      formatCallName(CallNameFormat.ABBREVIATED, { ...patient, lastName: ' ' })
        .displayName,
    ).toBe('Juan');
  });

  it('CODE: solo el código agrupado, sin ningún nombre; la voz lo deletrea', () => {
    const result = formatCallName(CallNameFormat.CODE, patient);
    expect(result).toEqual({
      displayName: 'K7M2Q 9XW4P',
      spokenName: 'K 7 M 2 Q, 9 X W 4 P',
    });
    expect(JSON.stringify(result)).not.toMatch(/Juan|Pérez/);
  });

  it('quita espacios sobrantes de nombre y apellido', () => {
    expect(
      formatCallName(CallNameFormat.FULL, {
        ...patient,
        firstName: '  Juan ',
        lastName: ' Pérez  ',
      }).displayName,
    ).toBe('Juan Pérez');
  });
});
