import { AppointmentStatus as S } from '@/appointments/appointment-status';
import {
  MAX_CALLS_PER_APPOINTMENT,
  MIN_SECONDS_BETWEEN_CALLS,
  decideCall,
} from './appointment-call.policy';

const now = new Date('2026-10-01T12:00:00.000Z');
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

const base = {
  status: S.CONFIRMADO,
  isToday: true,
  previousCalls: 0,
  lastCalledAt: null as Date | null,
  now,
};

describe('decideCall (regla del llamado de pacientes)', () => {
  it('el primer llamado a un turno de hoy en sala de espera se permite (n.º 1)', () => {
    expect(decideCall(base)).toEqual({ allowed: true, callNumber: 1 });
  });

  it('volver a llamar pasado el intervalo suma 1 al número de llamado', () => {
    expect(
      decideCall({
        ...base,
        previousCalls: 2,
        lastCalledAt: secondsAgo(MIN_SECONDS_BETWEEN_CALLS),
      }),
    ).toEqual({ allowed: true, callNumber: 3 });
  });

  it.each([S.RESERVADO, S.EN_ATENCION, S.ATENDIDO, S.CANCELADO, S.AUSENTE])(
    'un turno %s no está en sala de espera',
    (status) => {
      expect(decideCall({ ...base, status })).toEqual({
        allowed: false,
        reason: 'NOT_WAITING',
      });
    },
  );

  it('un turno confirmado de otro día no se llama', () => {
    expect(decideCall({ ...base, isToday: false })).toEqual({
      allowed: false,
      reason: 'NOT_WAITING',
    });
  });

  it('llamar antes del intervalo mínimo se rechaza e informa cuánto falta', () => {
    expect(
      decideCall({
        ...base,
        previousCalls: 1,
        lastCalledAt: secondsAgo(5),
      }),
    ).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: MIN_SECONDS_BETWEEN_CALLS - 5,
    });
  });

  it('con el tope de llamados alcanzado no se puede llamar más', () => {
    expect(
      decideCall({
        ...base,
        previousCalls: MAX_CALLS_PER_APPOINTMENT,
        lastCalledAt: secondsAgo(3600),
      }),
    ).toEqual({ allowed: false, reason: 'MAX_CALLS' });
  });

  it('el último llamado permitido es el n.º del tope', () => {
    expect(
      decideCall({
        ...base,
        previousCalls: MAX_CALLS_PER_APPOINTMENT - 1,
        lastCalledAt: secondsAgo(3600),
      }),
    ).toEqual({ allowed: true, callNumber: MAX_CALLS_PER_APPOINTMENT });
  });
});
