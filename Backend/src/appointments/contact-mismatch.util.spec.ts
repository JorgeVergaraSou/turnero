import { contactMismatch } from './contact-mismatch.util';

describe('contactMismatch', () => {
  const patient = {
    firstName: 'Juan Carlos',
    lastName: 'González',
    phone: '11 5555-0000',
    email: 'juan@example.com',
  };

  it('no marca diferencias de forma: tildes, mayúsculas, un nombre de menos, prefijo', () => {
    expect(
      contactMismatch({
        patient,
        contact: {
          firstName: 'juan',
          lastName: 'GONZALEZ',
          phone: '+54 9 11 5555 0000',
          email: 'JUAN@example.com',
        },
      }),
    ).toEqual([]);
  });

  it('marca nombre, teléfono y email distintos', () => {
    expect(
      contactMismatch({
        patient,
        contact: {
          firstName: 'Intruso',
          lastName: 'Curioso',
          phone: '11 9999-9999',
          email: 'otro@example.com',
        },
      }),
    ).toEqual(['name', 'phone', 'email']);
  });

  it('un email nuevo cuando el legajo no tenía no es una diferencia', () => {
    expect(
      contactMismatch({
        patient: { ...patient, email: null },
        contact: { ...patient, email: 'nuevo@example.com' },
      }),
    ).toEqual([]);
  });

  it('apellido distinto con el mismo nombre también es diferencia', () => {
    expect(
      contactMismatch({
        patient,
        contact: { ...patient, lastName: 'Pérez' },
      }),
    ).toEqual(['name']);
  });

  it('obra social: distinta a la del legajo es diferencia; sin dato en el legajo, no', () => {
    const base = { ...patient, healthInsuranceId: 3 };
    expect(
      contactMismatch({
        patient: base,
        contact: { ...base, healthInsuranceId: 5 },
      }),
    ).toEqual(['healthInsurance']);
    expect(
      contactMismatch({
        patient: base,
        contact: { ...base, healthInsuranceId: null },
      }),
    ).toEqual(['healthInsurance']);
    expect(
      contactMismatch({
        patient: { ...patient, healthInsuranceId: null },
        contact: { ...base, healthInsuranceId: 5 },
      }),
    ).toEqual([]);
  });

  it('número de afiliado: ignora espacios, barras y guiones; otro número con la misma obra social es diferencia', () => {
    const base = {
      ...patient,
      healthInsuranceId: 3,
      healthInsuranceNumber: '61-123456-7/01',
    };
    expect(
      contactMismatch({
        patient: base,
        contact: { ...base, healthInsuranceNumber: '61 1234567 01' },
      }),
    ).toEqual([]);
    expect(
      contactMismatch({
        patient: base,
        contact: { ...base, healthInsuranceNumber: '99' },
      }),
    ).toEqual(['healthInsuranceNumber']);
    // legajo sin número: nada que comparar
    expect(
      contactMismatch({
        patient: { ...base, healthInsuranceNumber: null },
        contact: { ...base, healthInsuranceNumber: '99' },
      }),
    ).toEqual([]);
  });
});
