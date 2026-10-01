import { AppointmentStatus as S, canTransition } from './appointment-status';

describe('canTransition (máquina de estados del turno)', () => {
  it.each([
    [S.RESERVADO, S.CONFIRMADO],
    [S.RESERVADO, S.CANCELADO],
    [S.RESERVADO, S.AUSENTE],
    [S.RESERVADO, S.EN_ATENCION],
    [S.CONFIRMADO, S.CANCELADO],
    [S.CONFIRMADO, S.AUSENTE],
    [S.CONFIRMADO, S.EN_ATENCION],
    [S.EN_ATENCION, S.ATENDIDO],
  ])('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    // estados finales: no se reabren
    [S.ATENDIDO, S.RESERVADO],
    [S.CANCELADO, S.RESERVADO],
    [S.CANCELADO, S.CONFIRMADO],
    [S.AUSENTE, S.EN_ATENCION],
    // una atención en curso no se cancela ni se marca ausente
    [S.EN_ATENCION, S.CANCELADO],
    [S.EN_ATENCION, S.AUSENTE],
    // no se salta la atención
    [S.RESERVADO, S.ATENDIDO],
    [S.CONFIRMADO, S.ATENDIDO],
    // confirmar dos veces no es una transición
    [S.CONFIRMADO, S.CONFIRMADO],
  ])('rechaza %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
