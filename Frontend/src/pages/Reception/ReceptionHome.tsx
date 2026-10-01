import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Appointment, Professional, ScheduleException } from '@/interfaces';
import { StaffPaths } from '@/models';
import { Button, ErrorNotice, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui';
import { ContactMismatchBadge } from '@/components/ContactMismatch';
import {
  EXCEPTION_LABEL,
  addDays,
  clinicTime,
  clinicToday,
  getErrorMessage,
  longDate,
  minutesUntil,
  numericDate,
  shortTime,
  showError,
} from '@/utilities';

/** Días hacia adelante en los que se buscan ausencias con turnos afectados. */
const ABSENCE_WINDOW_DAYS = 7;
/** Minutos de tolerancia: pasado esto, un turno sin "Llegó" queda sin resolver. */
const LATE_TOLERANCE_MINUTES = 15;
/** Cada cuánto se refresca solo (recepción deja esta pantalla abierta). */
const REFRESH_MS = 60_000;

interface AffectedAbsence {
  exception: ScheduleException;
  professionalName: string;
  appointments: Appointment[];
}

/**
 * Inicio de recepción: lo que hay que resolver AHORA, no la lista completa
 * del día (para eso está la Agenda). Quién está por llegar, quién espera,
 * qué turnos quedaron sin marcar, a quién llamar para confirmar mañana y
 * qué ausencias de profesionales pisan turnos ya dados. Solo datos
 * administrativos.
 */
export function ReceptionHomePage() {
  const today = clinicToday();
  const tomorrow = addDays(today, 1);

  const data = useAsync(async () => {
    const [appointments, exceptions, professionals] = await Promise.all([
      receptionApi.appointments({ from: today, to: addDays(today, ABSENCE_WINDOW_DAYS) }),
      adminApi.exceptions({ from: today, to: addDays(today, ABSENCE_WINDOW_DAYS) }),
      adminApi.professionals(),
    ]);
    return { appointments, exceptions, professionals, loadedAt: clinicTime() };
  }, [today]);

  // refresco automático sin reiniciar el intervalo en cada render
  const reloadRef = useRef(data.reload);
  useLayoutEffect(() => {
    reloadRef.current = data.reload;
  });
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => {
    if (!data.data) return null;
    const { appointments, exceptions, professionals } = data.data;
    const todays = appointments.filter((a) => a.date === today);
    const lateness = (a: Appointment) => -minutesUntil(a.date, a.startTime);

    return {
      arriving: todays
        .filter((a) => a.status === 'RESERVADO' && lateness(a) <= LATE_TOLERANCE_MINUTES)
        .slice(0, 8),
      waiting: todays.filter((a) => a.status === 'CONFIRMADO'),
      inAttention: todays.filter((a) => a.status === 'EN_ATENCION'),
      unresolved: todays.filter(
        (a) => a.status === 'RESERVADO' && lateness(a) > LATE_TOLERANCE_MINUTES,
      ),
      tomorrow: appointments.filter((a) => a.date === tomorrow && a.status === 'RESERVADO'),
      tomorrowConfirmed: appointments.filter(
        (a) => a.date === tomorrow && a.status === 'CONFIRMADO',
      ).length,
      todayTotal: todays.filter((a) => a.status !== 'CANCELADO').length,
      absences: affectedByAbsences(appointments, exceptions, professionals),
    };
  }, [data.data, today, tomorrow]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      data.reload();
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo actualizar el turno');
    }
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Recepción"
        description={
          <span className="first-letter:uppercase">
            {longDate(today)}
            {view && `, ${view.todayTotal} ${view.todayTotal === 1 ? 'turno' : 'turnos'} en el día`}
            {data.data && (
              <span className="text-ink-faint"> (actualizado {shortTime(data.data.loadedAt)})</span>
            )}
          </span>
        }
        actions={
          <>
            <Link
              to={StaffPaths.PATIENTS}
              className="inline-flex h-10 items-center rounded-(--radius-control) border border-line bg-sheet px-4 font-medium hover:border-ink-soft"
            >
              Buscar paciente
            </Link>
            <Link
              to={StaffPaths.NEW_APPOINTMENT}
              className="inline-flex h-10 items-center rounded-(--radius-control) bg-eucalyptus px-4 font-medium text-white hover:bg-eucalyptus-dark"
            >
              Dar turno
            </Link>
          </>
        }
      />

      {!view ? (
        data.error ? <ErrorNotice message={data.error} onRetry={data.reload} /> : <Spinner />
      ) : (
        <div className="grid gap-6">
          {view.unresolved.length > 0 && (
            <Section
              title="Sin resolver"
              note={`Ya pasaron más de ${LATE_TOLERANCE_MINUTES} minutos y siguen como reservados: marcá si llegaron o si faltaron.`}
              tone="alert"
            >
              <AppointmentList
                appointments={view.unresolved}
                actions={(a) => (
                  <>
                    <Button size="sm" onClick={() => run(() => receptionApi.confirm(a.id))}>
                      Llegó
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => receptionApi.noShow(a.id))}>
                      Ausente
                    </Button>
                  </>
                )}
              />
            </Section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Por llegar"
              note="Próximos turnos de hoy que todavía no se presentaron."
              empty="No hay más pacientes por llegar hoy."
              count={view.arriving.length}
            >
              <AppointmentList
                appointments={view.arriving}
                showCountdown
                actions={(a) => (
                  <Button size="sm" onClick={() => run(() => receptionApi.confirm(a.id))}>
                    Llegó
                  </Button>
                )}
              />
            </Section>

            <Section
              title="En sala de espera"
              note={
                view.inAttention.length > 0
                  ? `${view.inAttention.length} ${view.inAttention.length === 1 ? 'paciente' : 'pacientes'} en atención ahora.`
                  : 'Llegaron y esperan que el profesional los llame.'
              }
              empty="Nadie esperando."
              count={view.waiting.length}
            >
              <AppointmentList appointments={view.waiting} />
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Para confirmar mañana"
              note={
                view.tomorrowConfirmed > 0
                  ? `Llamá para confirmar asistencia. Ya confirmados: ${view.tomorrowConfirmed}.`
                  : 'Llamá para confirmar asistencia.'
              }
              empty="No quedan turnos de mañana sin confirmar."
              count={view.tomorrow.length}
              footer={
                <Link to={StaffPaths.agendaFor(tomorrow)} className="text-eucalyptus underline underline-offset-2">
                  Ver la agenda de mañana
                </Link>
              }
            >
              <AppointmentList
                appointments={view.tomorrow}
                showPhone
                actions={(a) => (
                  <Button size="sm" variant="secondary" onClick={() => run(() => receptionApi.confirm(a.id))}>
                    Confirmó
                  </Button>
                )}
              />
            </Section>

            <Section
              title="Ausencias de profesionales"
              note={`Hoy y los próximos ${ABSENCE_WINDOW_DAYS} días.`}
              empty={`Nadie falta hasta el ${numericDate(addDays(today, ABSENCE_WINDOW_DAYS))}.`}
              count={view.absences.length}
            >
              <ul className="divide-y divide-line-soft">
                {view.absences.map((item) => (
                  <AbsenceRow key={item.exception.id} item={item} />
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  count,
  empty,
  tone,
  footer,
  children,
}: {
  title: string;
  note?: string;
  count?: number;
  empty?: string;
  tone?: 'alert';
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <Panel className={tone === 'alert' ? 'border-st-attention/50 bg-st-attention-wash/40' : ''}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 className={`text-lg font-bold ${tone === 'alert' ? 'text-st-attention' : ''}`}>{title}</h2>
        {count !== undefined && count > 0 && <span className="text-ink-soft tabular">{count}</span>}
      </div>
      {note && <p className="px-5 text-sm text-ink-soft">{note}</p>}
      <div className="px-5 pt-2 pb-4">
        {isEmpty && empty ? <p className="py-3 text-ink-soft">{empty}</p> : children}
      </div>
      {footer && <div className="border-t border-line-soft px-5 py-3">{footer}</div>}
    </Panel>
  );
}

function AppointmentList({
  appointments,
  actions,
  showPhone = false,
  showCountdown = false,
}: {
  appointments: Appointment[];
  actions?: (a: Appointment) => ReactNode;
  showPhone?: boolean;
  showCountdown?: boolean;
}) {
  return (
    <ul className="divide-y divide-line-soft">
      {appointments.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5">
          <span className="w-12 font-mono font-semibold tabular">{shortTime(a.startTime)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {a.patient.lastName}, {a.patient.firstName}
            </span>
            <span className="block text-sm text-ink-soft">
              {a.professional.lastName}
              {showCountdown && ` (${countdown(a)})`}
            </span>
            <ContactMismatchBadge appointment={a} />
          </span>
          {showPhone && (
            <a href={`tel:${a.contactPhone}`} className="font-mono text-sm text-eucalyptus tabular hover:underline">
              {a.contactPhone}
            </a>
          )}
          {!actions && <StatusBadge status={a.status} />}
          {actions && <span className="flex gap-1.5">{actions(a)}</span>}
        </li>
      ))}
    </ul>
  );
}

function AbsenceRow({ item }: { item: AffectedAbsence }) {
  const { exception: e, professionalName, appointments } = item;
  const range =
    e.startDate === e.endDate
      ? numericDate(e.startDate)
      : `del ${numericDate(e.startDate)} al ${numericDate(e.endDate)}`;
  const hours = e.startTime ? `, de ${shortTime(e.startTime)} a ${shortTime(e.endTime!)}` : '';
  const first = appointments[0];
  return (
    <li className="py-2.5">
      <p className="font-medium">{professionalName}</p>
      <p className="text-sm text-ink-soft tabular">
        {EXCEPTION_LABEL[e.type]}, {range}
        {hours}
      </p>
      {appointments.length > 0 ? (
        <Link
          to={StaffPaths.agendaFor(first.date, e.professionalId ?? undefined)}
          className="mt-1 inline-block text-sm font-medium text-st-cancelled underline underline-offset-2"
        >
          {appointments.length} {appointments.length === 1 ? 'turno dado' : 'turnos dados'} en ese
          período: reprogramar
        </Link>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">Sin turnos afectados.</p>
      )}
    </li>
  );
}

/** "en 25 min", "hace 5 min" o "ahora". */
function countdown(a: Appointment): string {
  const minutes = minutesUntil(a.date, a.startTime);
  if (minutes > 0) return `en ${minutes} min`;
  if (minutes < 0) return `hace ${-minutes} min`;
  return 'ahora';
}

/**
 * Ausencias (todo menos HORARIO_ESPECIAL) y los turnos vigentes que caen
 * adentro: mismo profesional (o ausencia global, ej. feriado), fecha en el
 * rango y, si la ausencia es por franja, horario superpuesto.
 */
function affectedByAbsences(
  appointments: Appointment[],
  exceptions: ScheduleException[],
  professionals: Professional[],
): AffectedAbsence[] {
  const nameOf = (id: number | null) => {
    if (id === null) return 'Todos los profesionales';
    const p = professionals.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : 'Profesional';
  };
  return exceptions
    .filter((e) => e.active && e.type !== 'HORARIO_ESPECIAL')
    .map((e) => ({
      exception: e,
      professionalName: nameOf(e.professionalId),
      appointments: appointments.filter(
        (a) =>
          ['RESERVADO', 'CONFIRMADO'].includes(a.status) &&
          (e.professionalId === null || e.professionalId === a.professional.id) &&
          e.startDate <= a.date &&
          a.date <= e.endDate &&
          (!e.startTime || (a.startTime < e.endTime! && a.endTime > e.startTime)),
      ),
    }))
    .sort((a, b) => b.appointments.length - a.appointments.length);
}

export default ReceptionHomePage;
