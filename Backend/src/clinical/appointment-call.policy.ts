import { AppointmentStatus } from '@/appointments/appointment-status';

/** Máximo de llamados por turno (el 1.º + los "volver a llamar"). */
export const MAX_CALLS_PER_APPOINTMENT = 5;

/** Segundos mínimos entre dos llamados del mismo turno. */
export const MIN_SECONDS_BETWEEN_CALLS = 15;

/** Estado que cuenta como "en sala de espera": el paciente llegó o confirmó
 * (ver AppointmentStatus.CONFIRMADO) y todavía no entró a atención. */
export const WAITING_ROOM_STATUS = AppointmentStatus.CONFIRMADO;

export type CallDecision =
  | { allowed: true; callNumber: number }
  | {
      allowed: false;
      reason: 'NOT_WAITING' | 'MAX_CALLS' | 'TOO_SOON';
      /** solo TOO_SOON: segundos que faltan para poder volver a llamar */
      retryAfterSeconds?: number;
    };

/**
 * Regla de negocio del llamado, sin base de datos (testeable sola):
 * solo se llama a un turno de HOY en sala de espera, hasta
 * MAX_CALLS_PER_APPOINTMENT veces y con una pausa entre llamados.
 */
export function decideCall(input: {
  status: AppointmentStatus;
  isToday: boolean;
  previousCalls: number;
  lastCalledAt: Date | null;
  now: Date;
}): CallDecision {
  if (input.status !== WAITING_ROOM_STATUS || !input.isToday) {
    return { allowed: false, reason: 'NOT_WAITING' };
  }
  if (input.previousCalls >= MAX_CALLS_PER_APPOINTMENT) {
    return { allowed: false, reason: 'MAX_CALLS' };
  }
  if (input.lastCalledAt) {
    const elapsed = (input.now.getTime() - input.lastCalledAt.getTime()) / 1000;
    if (elapsed < MIN_SECONDS_BETWEEN_CALLS) {
      return {
        allowed: false,
        reason: 'TOO_SOON',
        retryAfterSeconds: Math.ceil(MIN_SECONDS_BETWEEN_CALLS - elapsed),
      };
    }
  }
  return { allowed: true, callNumber: input.previousCalls + 1 };
}
