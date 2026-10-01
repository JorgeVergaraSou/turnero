import {
  addDays,
  isoWeekday,
  minutesToTime,
  normalizeTime,
  timeToMinutes,
} from '@/common/utils/clinic-time.util';
import { ScheduleExceptionType } from './scheduling.enums';

/**
 * Cálculo de disponibilidad — función pura, sin base de datos, para que
 * se pueda testear exhaustivamente (ver availability.calculator.spec.ts).
 * AvailabilityService junta los datos y llama a esto.
 *
 * Fechas 'YYYY-MM-DD' y horas 'HH:mm:ss' locales del consultorio.
 */

export interface ScheduleRule {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  officeId: number;
  validFrom: string;
  validUntil: string | null;
}

export interface ExceptionRule {
  type: ScheduleExceptionType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  officeId: number | null;
  slotMinutes: number | null;
}

/** franja ya ocupada por un turno activo */
export interface BusyRange {
  date: string;
  startTime: string;
  endTime: string;
}

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
  officeId: number;
}

export interface AvailabilityInput {
  from: string;
  to: string;
  schedules: ScheduleRule[];
  exceptions: ExceptionRule[];
  busy: BusyRange[];
  /** "ahora" en la zona del consultorio: no se ofrecen turnos pasados */
  now: { date: string; time: string };
}

interface Window {
  start: number;
  end: number;
  slotMinutes: number;
  officeId: number;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

const coversDate = (
  rule: { startDate: string; endDate: string },
  date: string,
) => rule.startDate <= date && date <= rule.endDate;

export function computeAvailableSlots(input: AvailabilityInput): Slot[] {
  const slots: Slot[] = [];
  const nowMinutes = timeToMinutes(input.now.time);

  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    if (date < input.now.date) {
      continue;
    }

    const weekday = isoWeekday(date);
    const windows: Window[] = [];

    for (const schedule of input.schedules) {
      if (
        schedule.weekday === weekday &&
        schedule.validFrom <= date &&
        (schedule.validUntil === null || date <= schedule.validUntil)
      ) {
        windows.push({
          start: timeToMinutes(schedule.startTime),
          end: timeToMinutes(schedule.endTime),
          slotMinutes: schedule.slotMinutes,
          officeId: schedule.officeId,
        });
      }
    }

    const exceptionsToday = input.exceptions.filter((e) => coversDate(e, date));

    for (const special of exceptionsToday) {
      if (
        special.type === ScheduleExceptionType.HORARIO_ESPECIAL &&
        special.startTime &&
        special.endTime &&
        special.officeId &&
        special.slotMinutes
      ) {
        windows.push({
          start: timeToMinutes(special.startTime),
          end: timeToMinutes(special.endTime),
          slotMinutes: special.slotMinutes,
          officeId: special.officeId,
        });
      }
    }

    const blocks = exceptionsToday.filter(
      (e) => e.type !== ScheduleExceptionType.HORARIO_ESPECIAL,
    );
    if (blocks.some((b) => b.startTime === null)) {
      continue; // día completo bloqueado (vacaciones, feriado, licencia…)
    }
    const blockRanges = blocks.map((b) => ({
      start: timeToMinutes(b.startTime!),
      end: timeToMinutes(b.endTime!),
    }));

    const busyRanges = input.busy
      .filter((b) => b.date === date)
      .map((b) => ({
        start: timeToMinutes(b.startTime),
        end: timeToMinutes(b.endTime),
      }));

    // genera los slots de cada ventana y descarta los que se solapen con
    // uno ya aceptado (dos ventanas superpuestas, ej. un horario especial
    // encima del regular, no deben ofrecer turnos que se pisen entre sí)
    const candidates = windows
      .flatMap((w) => {
        const generated: Window[] = [];
        for (let s = w.start; s + w.slotMinutes <= w.end; s += w.slotMinutes) {
          generated.push({ ...w, start: s, end: s + w.slotMinutes });
        }
        return generated;
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const accepted: Window[] = [];
    for (const candidate of candidates) {
      if (
        accepted.some((a) =>
          overlaps(a.start, a.end, candidate.start, candidate.end),
        )
      ) {
        continue;
      }
      if (date === input.now.date && candidate.start <= nowMinutes) {
        continue;
      }
      if (
        blockRanges.some((b) =>
          overlaps(b.start, b.end, candidate.start, candidate.end),
        )
      ) {
        continue;
      }
      if (
        busyRanges.some((b) =>
          overlaps(b.start, b.end, candidate.start, candidate.end),
        )
      ) {
        continue;
      }
      accepted.push(candidate);
    }

    for (const slot of accepted) {
      slots.push({
        date,
        startTime: minutesToTime(slot.start),
        endTime: minutesToTime(slot.end),
        officeId: slot.officeId,
      });
    }
  }

  return slots;
}

/** Busca un slot exacto (fecha + hora de inicio) entre los disponibles. */
export function findSlot(
  slots: Slot[],
  date: string,
  startTime: string,
): Slot | undefined {
  const normalized = normalizeTime(startTime);
  return slots.find((s) => s.date === date && s.startTime === normalized);
}
