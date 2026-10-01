import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { doctorApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Appointment, DoctorDashboard } from '@/interfaces';
import { StaffPaths } from '@/models';
import { CallPatientButton } from '@/components/CallPatientButton';
import { Button, EmptyState, ErrorNotice, Panel, Spinner, StatusBadge } from '@/components/ui';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { addDays, clinicToday, longDate, shortTime } from '@/utilities';

/** Cuántos días hacia adelante muestra "Próximos turnos" (el backend admite hasta 31). */
const UPCOMING_DAYS = 14;

/** "4 turnos: 3 por atender, 1 atendido (1 cancelado)": solo lo que hay, bien pluralizado. */
function summarize(counts: DoctorDashboard['counts']): string {
  const n = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  const active = counts.total - counts.cancelled;
  const parts = [
    counts.pending > 0 && `${counts.pending} por atender`,
    counts.inAttention > 0 && `${counts.inAttention} en atención`,
    counts.attended > 0 && n(counts.attended, 'atendido', 'atendidos'),
    counts.noShow > 0 && n(counts.noShow, 'ausente', 'ausentes'),
  ].filter(Boolean);
  const cancelled = counts.cancelled > 0 ? ` (${n(counts.cancelled, 'cancelado', 'cancelados')})` : '';
  return `${n(active, 'turno', 'turnos')}${parts.length ? `: ${parts.join(', ')}` : ''}${cancelled}`;
}

/**
 * Inicio del médico: la lista del día en orden, con la próxima atención
 * destacada y un botón por turno. Priorizado para ir rápido: un clic
 * lleva a la atención.
 */
export function DoctorHomePage() {
  const [date, setDate] = useState(clinicToday());
  const me = useAsync(() => doctorApi.me(), []);
  const dashboard = useAsync(() => doctorApi.dashboard(date), [date]);
  const navigate = useNavigate();
  const { settings } = useClinicSettings();
  const isToday = date === clinicToday();

  if (me.error) return <ErrorNotice message={me.error} />;

  const list = dashboard.data?.appointments ?? [];
  const inAttention = list.find((a) => a.status === 'EN_ATENCION');
  const next = list.find((a) => ['RESERVADO', 'CONFIRMADO'].includes(a.status));
  const counts = dashboard.data?.counts;

  return (
    <div className="grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <header className="mb-6">
          <p className="text-ink-soft">
            {me.data && `${me.data.firstName} ${me.data.lastName}`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold first-letter:uppercase">
              {isToday ? 'Hoy, ' : ''}
              {longDate(date)}
            </h1>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}>
                <ChevronRightIcon className="size-4" />
              </Button>
              {!isToday && (
                <Button size="sm" variant="ghost" onClick={() => setDate(clinicToday())}>
                  Hoy
                </Button>
              )}
            </div>
          </div>
          {counts && counts.total > 0 && (
            <p className="mt-2 text-ink-soft tabular">{summarize(counts)}</p>
          )}
        </header>

        {isToday && (inAttention ?? next) && (
          <NextUp
            appointment={(inAttention ?? next)!}
            resuming={!!inAttention}
            onAttend={(a) => navigate(StaffPaths.attention(a.id))}
          />
        )}

        {dashboard.loading ? (
          <Spinner />
        ) : dashboard.error ? (
          <ErrorNotice message={dashboard.error} onRetry={dashboard.reload} />
        ) : list.length === 0 ? (
          <EmptyState title={isToday ? 'No tenés turnos hoy' : 'No tenés turnos este día'} />
        ) : (
          <Panel as="div">
            <ol className="divide-y divide-line-soft">
              {list.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appointment={a}
                  canAttend={isToday}
                  canCall={isToday && settings?.callsEnabled !== false}
                  onAttend={() => navigate(StaffPaths.attention(a.id))}
                />
              ))}
            </ol>
          </Panel>
        )}
      </div>

      <UpcomingAppointments selectedDate={date} onPickDay={setDate} />
    </div>
  );
}

/**
 * Próximos turnos de los días siguientes (desde mañana), agrupados por
 * día, para que el médico vea qué se viene sin navegar día por día. Cada
 * día abre su lista completa en la columna principal. Siempre relativo a
 * hoy, sin importar qué día se esté mirando.
 */
function UpcomingAppointments({
  selectedDate,
  onPickDay,
}: {
  selectedDate: string;
  onPickDay: (date: string) => void;
}) {
  const today = clinicToday();
  const from = addDays(today, 1);
  const to = addDays(today, UPCOMING_DAYS);
  const upcoming = useAsync(() => doctorApi.appointments(from, to), [from, to]);

  const days = useMemo(() => {
    const byDate = new Map<string, Appointment[]>();
    for (const a of upcoming.data ?? []) {
      if (a.status === 'CANCELADO') continue;
      byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
    }
    return [...byDate.entries()];
  }, [upcoming.data]);

  const total = days.reduce((sum, [, list]) => sum + list.length, 0);

  return (
    <section aria-labelledby="upcoming-title" className="xl:pt-1">
      <h2 id="upcoming-title" className="text-lg font-bold">
        Próximos turnos
      </h2>
      <p className="mb-3 text-sm text-ink-soft tabular">
        {upcoming.data
          ? `${total} ${total === 1 ? 'turno' : 'turnos'} en los próximos ${UPCOMING_DAYS} días`
          : `Próximos ${UPCOMING_DAYS} días`}
      </p>

      {upcoming.loading ? (
        <Spinner />
      ) : upcoming.error ? (
        <ErrorNotice message={upcoming.error} onRetry={upcoming.reload} />
      ) : days.length === 0 ? (
        <p className="rounded-(--radius-panel) border border-dashed border-line px-4 py-6 text-center text-ink-soft">
          No tenés turnos en los próximos {UPCOMING_DAYS} días.
        </p>
      ) : (
        <ol className="grid gap-3">
          {days.map(([date, list]) => {
            const selected = date === selectedDate;
            return (
              <li key={date}>
                <Panel as="div" className={selected ? 'ring-2 ring-ink' : ''}>
                  <button
                    type="button"
                    onClick={() => onPickDay(date)}
                    aria-current={selected ? 'date' : undefined}
                    className="flex w-full items-baseline justify-between gap-3 rounded-t-(--radius-panel) px-4 pt-3 pb-2 text-left hover:bg-line-soft/60"
                    title="Ver el día completo"
                  >
                    <span className="font-medium first-letter:uppercase">
                      {date === from ? `Mañana, ${longDate(date)}` : longDate(date)}
                    </span>
                    <span className="shrink-0 text-sm text-ink-soft tabular">{list.length}</span>
                  </button>
                  <ul className="px-4 pb-3">
                    {list.map((a) => (
                      <li key={a.id} className="flex items-baseline gap-3 py-0.5">
                        <span className="w-11 shrink-0 font-mono text-sm font-semibold tabular">
                          {shortTime(a.startTime)}
                        </span>
                        <Link
                          to={StaffPaths.doctorPatient(a.patient.id)}
                          className="min-w-0 truncate hover:underline"
                        >
                          {a.patient.lastName}, {a.patient.firstName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NextUp({
  appointment: a,
  resuming,
  onAttend,
}: {
  appointment: Appointment;
  resuming: boolean;
  onAttend: (a: Appointment) => void;
}) {
  return (
    <section
      aria-label={resuming ? 'Atención en curso' : 'Próximo paciente'}
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-(--radius-panel) bg-ink px-6 py-5 text-white"
    >
      <div>
        <p className="text-white/70">{resuming ? 'Atención en curso' : 'Próximo paciente'}</p>
        <p className="mt-1 text-2xl font-bold">
          <span className="font-mono tabular">{shortTime(a.startTime)}</span>{' '}
          {a.patient.firstName} {a.patient.lastName}
        </p>
      </div>
      <Button size="lg" variant="secondary" onClick={() => onAttend(a)} className="border-transparent">
        {resuming ? 'Volver a la atención' : 'Atender'}
      </Button>
    </section>
  );
}

function AppointmentRow({
  appointment: a,
  canAttend,
  canCall,
  onAttend,
}: {
  appointment: Appointment;
  canAttend: boolean;
  canCall: boolean;
  onAttend: () => void;
}) {
  const pending = ['RESERVADO', 'CONFIRMADO'].includes(a.status);
  const done = ['CANCELADO', 'AUSENTE'].includes(a.status);
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${done ? 'text-ink-faint' : ''}`}>
      <span className="w-14 font-mono text-lg font-semibold tabular">{shortTime(a.startTime)}</span>
      <span className="min-w-0 flex-1">
        <Link to={StaffPaths.doctorPatient(a.patient.id)} className="font-medium hover:underline">
          {a.patient.lastName}, {a.patient.firstName}
        </Link>
        <span className="block text-sm text-ink-soft">{a.specialty.name}</span>
      </span>
      <StatusBadge status={a.status} />
      <span className="flex min-w-40 flex-wrap items-center justify-end gap-2 text-right">
        {canCall && a.status === 'CONFIRMADO' && <CallPatientButton appointmentId={a.id} />}
        {canAttend && pending && (
          <Button size="sm" onClick={onAttend}>
            Atender
          </Button>
        )}
        {a.status === 'EN_ATENCION' && (
          <Button size="sm" variant="secondary" onClick={onAttend}>
            Continuar
          </Button>
        )}
        {a.status === 'ATENDIDO' && (
          <Link
            to={StaffPaths.doctorPatient(a.patient.id)}
            className="text-sm text-eucalyptus underline underline-offset-2"
          >
            Ver historia
          </Link>
        )}
      </span>
    </li>
  );
}

export default DoctorHomePage;
