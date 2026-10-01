import {
  AvailabilityInput,
  ScheduleRule,
  computeAvailableSlots,
  findSlot,
} from './availability.calculator';
import { ScheduleExceptionType } from './scheduling.enums';

// 2026-10-05 es lunes
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';

const mondayMorning: ScheduleRule = {
  weekday: 1,
  startTime: '08:00:00',
  endTime: '10:00:00',
  slotMinutes: 30,
  officeId: 1,
  validFrom: '2026-01-01',
  validUntil: null,
};

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    from: MONDAY,
    to: MONDAY,
    schedules: [mondayMorning],
    exceptions: [],
    busy: [],
    now: { date: '2026-10-01', time: '12:00:00' },
    ...overrides,
  };
}

const starts = (slots: { startTime: string }[]) =>
  slots.map((s) => s.startTime);

describe('computeAvailableSlots', () => {
  it('genera slots de la duración configurada dentro del horario', () => {
    const slots = computeAvailableSlots(input());

    expect(starts(slots)).toEqual([
      '08:00:00',
      '08:30:00',
      '09:00:00',
      '09:30:00',
    ]);
    expect(slots[0]).toEqual({
      date: MONDAY,
      startTime: '08:00:00',
      endTime: '08:30:00',
      officeId: 1,
    });
  });

  it('no genera un slot que no entra completo al final del horario', () => {
    const slots = computeAvailableSlots(
      input({ schedules: [{ ...mondayMorning, slotMinutes: 45 }] }),
    );

    // 08:00, 08:45 — 09:30+45 = 10:15 se pasa del fin (10:00)
    expect(starts(slots)).toEqual(['08:00:00', '08:45:00']);
  });

  it('solo aplica el horario el día de la semana configurado', () => {
    const slots = computeAvailableSlots(input({ from: TUESDAY, to: TUESDAY }));

    expect(slots).toEqual([]);
  });

  it('respeta la vigencia del horario (validFrom / validUntil)', () => {
    expect(
      computeAvailableSlots(
        input({ schedules: [{ ...mondayMorning, validFrom: '2026-10-06' }] }),
      ),
    ).toEqual([]);
    expect(
      computeAvailableSlots(
        input({ schedules: [{ ...mondayMorning, validUntil: '2026-10-04' }] }),
      ),
    ).toEqual([]);
  });

  it('excluye los horarios ocupados por turnos activos', () => {
    const slots = computeAvailableSlots(
      input({
        busy: [{ date: MONDAY, startTime: '08:30:00', endTime: '09:00:00' }],
      }),
    );

    expect(starts(slots)).toEqual(['08:00:00', '09:00:00', '09:30:00']);
  });

  it('excluye un slot solapado parcialmente por un turno de otra duración', () => {
    // turno viejo de 45 min (08:00–08:45) cuando el horario era de 45:
    // hoy con slots de 30, bloquea 08:00 y 08:30
    const slots = computeAvailableSlots(
      input({
        busy: [{ date: MONDAY, startTime: '08:00:00', endTime: '08:45:00' }],
      }),
    );

    expect(starts(slots)).toEqual(['09:00:00', '09:30:00']);
  });

  it('un feriado global de día completo bloquea todo el día', () => {
    const slots = computeAvailableSlots(
      input({
        exceptions: [
          {
            type: ScheduleExceptionType.FERIADO,
            startDate: MONDAY,
            endDate: MONDAY,
            startTime: null,
            endTime: null,
            officeId: null,
            slotMinutes: null,
          },
        ],
      }),
    );

    expect(slots).toEqual([]);
  });

  it('vacaciones de varios días bloquean todos los días del rango', () => {
    const slots = computeAvailableSlots(
      input({
        from: MONDAY,
        to: '2026-10-19',
        exceptions: [
          {
            type: ScheduleExceptionType.VACACIONES,
            startDate: '2026-10-05',
            endDate: '2026-10-12',
            startTime: null,
            endTime: null,
            officeId: null,
            slotMinutes: null,
          },
        ],
      }),
    );

    // lunes 5 y lunes 12 bloqueados; lunes 19 libre
    expect([...new Set(slots.map((s) => s.date))]).toEqual(['2026-10-19']);
  });

  it('un bloqueo por franja horaria solo quita los slots que se solapan', () => {
    const slots = computeAvailableSlots(
      input({
        exceptions: [
          {
            type: ScheduleExceptionType.REUNION,
            startDate: MONDAY,
            endDate: MONDAY,
            startTime: '08:15:00',
            endTime: '09:00:00',
            officeId: null,
            slotMinutes: null,
          },
        ],
      }),
    );

    expect(starts(slots)).toEqual(['09:00:00', '09:30:00']);
  });

  it('un HORARIO_ESPECIAL agrega disponibilidad en un día sin horario regular', () => {
    const slots = computeAvailableSlots(
      input({
        from: TUESDAY,
        to: TUESDAY,
        exceptions: [
          {
            type: ScheduleExceptionType.HORARIO_ESPECIAL,
            startDate: TUESDAY,
            endDate: TUESDAY,
            startTime: '14:00:00',
            endTime: '15:00:00',
            officeId: 2,
            slotMinutes: 20,
          },
        ],
      }),
    );

    expect(starts(slots)).toEqual(['14:00:00', '14:20:00', '14:40:00']);
    expect(slots.every((s) => s.officeId === 2)).toBe(true);
  });

  it('un HORARIO_ESPECIAL superpuesto al regular no genera slots que se pisen', () => {
    const slots = computeAvailableSlots(
      input({
        exceptions: [
          {
            type: ScheduleExceptionType.HORARIO_ESPECIAL,
            startDate: MONDAY,
            endDate: MONDAY,
            startTime: '09:45:00',
            endTime: '10:45:00',
            officeId: 1,
            slotMinutes: 30,
          },
        ],
      }),
    );

    // 09:45 se pisa con 09:30–10:00 (regular) → descartado; 10:15 sí entra
    expect(starts(slots)).toEqual([
      '08:00:00',
      '08:30:00',
      '09:00:00',
      '09:30:00',
      '10:15:00',
    ]);
  });

  it('no ofrece fechas pasadas', () => {
    const slots = computeAvailableSlots(
      input({ now: { date: '2026-10-06', time: '07:00:00' } }),
    );

    expect(slots).toEqual([]);
  });

  it('hoy solo ofrece los horarios que todavía no empezaron', () => {
    const slots = computeAvailableSlots(
      input({ now: { date: MONDAY, time: '08:30:00' } }),
    );

    // 08:30 ya empezó (<= ahora) → no se ofrece
    expect(starts(slots)).toEqual(['09:00:00', '09:30:00']);
  });
});

describe('findSlot', () => {
  it('encuentra un slot por fecha y hora, aceptando HH:mm', () => {
    const slots = computeAvailableSlots(input());

    expect(findSlot(slots, MONDAY, '08:30')?.endTime).toBe('09:00:00');
    expect(findSlot(slots, MONDAY, '08:15')).toBeUndefined();
  });
});
