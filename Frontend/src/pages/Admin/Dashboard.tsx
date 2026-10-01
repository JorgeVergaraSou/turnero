import { Link } from 'react-router-dom';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { adminApi, receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { AppointmentStatus } from '@/interfaces';
import { StaffPaths } from '@/models';
import { ErrorNotice, PageHeader, Panel, Spinner } from '@/components/ui';
import {
  EXCEPTION_LABEL,
  addDays,
  clinicToday,
  longDate,
  numericDate,
} from '@/utilities';

/**
 * Inicio de administración: cómo viene el día en todo el consultorio,
 * quién falta en los próximos días y, mientras falte algo, qué hay que
 * cargar para que los pacientes puedan reservar. Solo datos
 * administrativos — nada clínico.
 */
export function AdminDashboardPage() {
  const today = clinicToday();
  const data = useAsync(async () => {
    const [appointments, professionals, specialties, offices, exceptions] = await Promise.all([
      receptionApi.appointments({ from: today, to: today }),
      adminApi.professionals(),
      adminApi.specialties(),
      adminApi.offices(),
      adminApi.exceptions({ from: today, to: addDays(today, 14) }),
    ]);
    // horarios de los profesionales activos, para el checklist
    const active = professionals.filter((p) => p.active && p.userActive);
    const schedules = await Promise.all(active.map((p) => adminApi.schedules(p.id)));
    const withoutSchedule = active.filter((_, i) => !schedules[i].some((s) => s.active));
    return { appointments, professionals: active, specialties, offices, exceptions, withoutSchedule };
  }, [today]);

  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorNotice message={data.error} onRetry={data.reload} />;

  const { appointments, professionals, specialties, offices, exceptions, withoutSchedule } = data.data;

  const byStatus = (status: AppointmentStatus) => appointments.filter((a) => a.status === status).length;
  const PLURAL: Partial<Record<AppointmentStatus, [string, string]>> = {
    RESERVADO: ['reservado', 'reservados'],
    CONFIRMADO: ['confirmado', 'confirmados'],
    EN_ATENCION: ['en atención', 'en atención'],
    ATENDIDO: ['atendido', 'atendidos'],
    AUSENTE: ['ausente', 'ausentes'],
  };
  const active = appointments.length - byStatus('CANCELADO');
  const parts = (Object.keys(PLURAL) as AppointmentStatus[])
    .filter((s) => byStatus(s) > 0)
    .map((s) => `${byStatus(s)} ${PLURAL[s]![byStatus(s) === 1 ? 0 : 1]}`);
  const summary =
    active > 0 ? `${active} ${active === 1 ? 'turno' : 'turnos'}: ${parts.join(', ')}` : '';

  const byProfessional = professionals
    .map((p) => ({
      professional: p,
      appointments: appointments.filter((a) => a.professional.id === p.id && a.status !== 'CANCELADO'),
    }))
    .filter((row) => row.appointments.length > 0);

  const setup = [
    { done: specialties.some((s) => s.active), label: 'Cargar al menos una especialidad', to: StaffPaths.SPECIALTIES },
    { done: offices.some((o) => o.active), label: 'Cargar al menos un consultorio', to: StaffPaths.OFFICES },
    { done: professionals.length > 0, label: 'Dar de alta a los profesionales', to: StaffPaths.PROFESSIONALS },
    {
      done: professionals.length > 0 && withoutSchedule.length === 0,
      label:
        withoutSchedule.length > 0
          ? `Cargar horarios de ${withoutSchedule.map((p) => p.lastName).join(', ')}`
          : 'Cargar los horarios de atención',
      to: withoutSchedule[0] ? `${StaffPaths.SCHEDULES}?profesional=${withoutSchedule[0].id}` : StaffPaths.SCHEDULES,
    },
  ];
  const pendingSetup = setup.filter((s) => !s.done);
  const upcomingAbsences = exceptions.filter((e) => e.active && e.type !== 'HORARIO_ESPECIAL');
  const nameOf = (id: number | null) => {
    if (id === null) return 'Todos los profesionales';
    const p = professionals.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : 'Profesional inactivo';
  };

  return (
    <div className="max-w-5xl">
      <PageHeader title="Inicio" description={<span className="first-letter:uppercase">{longDate(today)}</span>} />

      {pendingSetup.length > 0 && (
        <Panel className="mb-6 p-5">
          <h2 className="text-lg font-bold">Para que los pacientes puedan reservar</h2>
          <ol className="mt-3 grid gap-2">
            {setup.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircleIcon className="size-5 shrink-0 text-eucalyptus" aria-label="Hecho" />
                ) : (
                  <span aria-label="Pendiente" className="size-5 shrink-0 rounded-full border-2 border-line" />
                )}
                {step.done ? (
                  <span className="text-ink-soft line-through">{step.label}</span>
                ) : (
                  <Link to={step.to} className="font-medium text-eucalyptus underline underline-offset-2">
                    {step.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Hoy en el consultorio</h2>
            <Link to={StaffPaths.AGENDA} className="text-eucalyptus underline underline-offset-2">
              Abrir agenda
            </Link>
          </div>
          {summary && <p className="mb-4 text-ink-soft tabular">{summary}</p>}
          {byProfessional.length === 0 ? (
            <Panel className="px-5 py-8 text-center text-ink-soft">No hay turnos para hoy.</Panel>
          ) : (
            <Panel as="div">
              <ul className="divide-y divide-line-soft">
                {byProfessional.map(({ professional, appointments: list }) => {
                  const done = list.filter((a) => ['ATENDIDO', 'AUSENTE'].includes(a.status)).length;
                  return (
                    <li key={professional.id} className="px-5 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">
                          {professional.lastName}, {professional.firstName}
                        </span>
                        <span className="text-ink-soft tabular">
                          {done} de {list.length}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={list.length}
                        aria-valuenow={done}
                        aria-label={`Turnos resueltos de ${professional.lastName}`}
                      >
                        <div className="h-full bg-eucalyptus" style={{ width: `${(done / list.length) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Próximas ausencias</h2>
          {upcomingAbsences.length === 0 ? (
            <p className="text-ink-soft">Nadie falta en las próximas dos semanas.</p>
          ) : (
            <ul className="grid gap-3">
              {upcomingAbsences.map((e) => (
                <li key={e.id}>
                  <p className="font-medium">{nameOf(e.professionalId)}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {EXCEPTION_LABEL[e.type]},{' '}
                    {e.startDate === e.endDate
                      ? numericDate(e.startDate)
                      : `del ${numericDate(e.startDate)} al ${numericDate(e.endDate)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link to={StaffPaths.SCHEDULES} className="mt-4 inline-block text-eucalyptus underline underline-offset-2">
            Cargar una ausencia
          </Link>
        </section>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
