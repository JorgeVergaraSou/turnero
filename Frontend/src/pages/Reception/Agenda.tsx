import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { adminApi, receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Appointment, AppointmentStatus } from '@/interfaces';
import { StaffPaths } from '@/models';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  StatusBadge,
  TextInput,
} from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { ContactMismatchBadge, ContactMismatchDetail } from '@/components/ContactMismatch';
import { healthInsuranceWithNumber } from '@/utilities';
import {
  addDays,
  clinicToday,
  dateTime,
  getErrorMessage,
  hasStarted,
  longDate,
  numericDate,
  shortTime,
  showError,
  STATUS_LABEL,
} from '@/utilities';

const PENDING: AppointmentStatus[] = ['RESERVADO', 'CONFIRMADO'];

/**
 * Agenda del día para recepción: todos los turnos, filtrables por
 * profesional, con las acciones administrativas (confirmar asistencia,
 * reprogramar, cancelar, marcar ausente). Nada clínico.
 */
export function AgendaPage() {
  // ?fecha=AAAA-MM-DD&profesional=ID abren la agenda en ese día/profesional
  // (lo usan los links del inicio de recepción)
  const [params] = useSearchParams();
  const [date, setDate] = useState(() => {
    const fecha = params.get('fecha');
    return fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : clinicToday();
  });
  const [professionalId, setProfessionalId] = useState<number | ''>(
    () => Number(params.get('profesional')) || '',
  );
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | ''>('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  const professionals = useAsync(() => adminApi.professionals(), []);
  const agenda = useAsync(
    () =>
      receptionApi.appointments({
        from: date,
        to: date,
        professionalId: professionalId || undefined,
      }),
    [date, professionalId],
  );

  const rows = useMemo(
    () => (agenda.data ?? []).filter((a) => !statusFilter || a.status === statusFilter),
    [agenda.data, statusFilter],
  );
  const counts = useMemo(() => {
    const list = agenda.data ?? [];
    return {
      total: list.filter((a) => a.status !== 'CANCELADO').length,
      pending: list.filter((a) => PENDING.includes(a.status)).length,
      attended: list.filter((a) => a.status === 'ATENDIDO').length,
    };
  }, [agenda.data]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      agenda.reload();
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo actualizar el turno');
    }
  };

  const confirm = (a: Appointment) => run(() => receptionApi.confirm(a.id));
  const noShow = (a: Appointment) => run(() => receptionApi.noShow(a.id));
  const cancel = async (a: Appointment) => {
    const { value: reason } = await Swal.fire({
      title: 'Cancelar turno',
      text: `${a.patient.lastName}, ${a.patient.firstName} — ${shortTime(a.startTime)} h`,
      input: 'text',
      inputLabel: 'Motivo',
      inputPlaceholder: 'Ej.: el paciente avisó que no puede venir',
      showCancelButton: true,
      confirmButtonText: 'Cancelar turno',
      cancelButtonText: 'Volver',
      inputValidator: (value) => (!value?.trim() ? 'Indicá el motivo.' : undefined),
    });
    if (reason) run(() => receptionApi.cancel(a.id, reason.trim()));
  };

  const isToday = date === clinicToday();

  return (
    <div>
      <PageHeader
        title="Agenda"
        description={
          <span className="first-letter:uppercase">
            {longDate(date)}
            {isToday && ' (hoy)'}
          </span>
        }
        actions={
          <Link
            to={StaffPaths.NEW_APPOINTMENT}
            className="inline-flex h-10 items-center rounded-(--radius-control) bg-eucalyptus px-4 font-medium text-white hover:bg-eucalyptus-dark"
          >
            Dar turno
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1">
          <Button variant="secondary" className="h-11" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <TextInput
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            wrapperClassName="w-44"
          />
          <Button variant="secondary" className="h-11" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRightIcon className="size-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" className="h-11" onClick={() => setDate(clinicToday())}>
              Hoy
            </Button>
          )}
        </div>
        <SelectInput
          label="Profesional"
          value={professionalId}
          onChange={(e) => setProfessionalId(e.target.value ? Number(e.target.value) : '')}
          wrapperClassName="w-60"
        >
          <option value="">Todos</option>
          {(professionals.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.lastName}, {p.firstName}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | '')}
          wrapperClassName="w-44"
        >
          <option value="">Todos</option>
          {(['RESERVADO', 'CONFIRMADO', 'EN_ATENCION', 'ATENDIDO', 'AUSENTE', 'CANCELADO'] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectInput>
        {agenda.data && counts.total > 0 && (
          <p className="ml-auto pb-2 text-ink-soft tabular">
            {[
              `${counts.total} ${counts.total === 1 ? 'turno' : 'turnos'}`,
              counts.pending > 0 && `${counts.pending} por atender`,
              counts.attended > 0 &&
                `${counts.attended} ${counts.attended === 1 ? 'atendido' : 'atendidos'}`,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        )}
      </div>

      {agenda.loading ? (
        <Spinner />
      ) : agenda.error ? (
        <ErrorNotice message={agenda.error} onRetry={agenda.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={statusFilter ? 'No hay turnos con ese estado' : 'No hay turnos para este día'}
          action={
            <Link to={StaffPaths.NEW_APPOINTMENT} className="font-medium text-eucalyptus underline underline-offset-2">
              Dar un turno
            </Link>
          }
        />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="border-b border-line text-sm text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Hora</th>
                <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                <th scope="col" className="px-4 py-3 font-medium">Profesional</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((a) => (
                <tr key={a.id} className={a.status === 'CANCELADO' ? 'text-ink-faint' : ''}>
                  <td className="px-4 py-3 align-top font-mono text-lg font-semibold tabular">
                    {shortTime(a.startTime)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => setDetailId(a.id)}
                      className="text-left font-medium hover:underline"
                    >
                      {a.patient.lastName}, {a.patient.firstName}
                    </button>
                    <span className="block font-mono text-sm text-ink-soft tabular">
                      DNI {a.patient.documentNumber}
                    </span>
                    <ContactMismatchBadge appointment={a} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    {a.professional.lastName}, {a.professional.firstName}
                    <span className="block text-sm text-ink-soft">{a.specialty.name}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {a.status === 'RESERVADO' && (
                        <Button size="sm" onClick={() => confirm(a)}>
                          Llegó
                        </Button>
                      )}
                      {PENDING.includes(a.status) && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setRescheduling(a)}>
                            Reprogramar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancel(a)}>
                            Cancelar
                          </Button>
                          {hasStarted(a.date, a.startTime) && (
                            <Button size="sm" variant="ghost" onClick={() => noShow(a)}>
                              Ausente
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {detailId && <AppointmentDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {rescheduling && (
        <RescheduleModal
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            agenda.reload();
          }}
        />
      )}
    </div>
  );
}

function AppointmentDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error } = useAsync(() => receptionApi.appointment(id), [id]);
  return (
    <Modal open onClose={onClose} title="Detalle del turno">
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorNotice message={error} />
      ) : data ? (
        <div className="grid gap-5">
          <ContactMismatchDetail appointment={data} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="col-span-2">
              <dt className="text-sm text-ink-soft">Paciente</dt>
              <dd className="font-medium">
                {data.patient.lastName}, {data.patient.firstName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Código</dt>
              <dd className="font-mono tabular">{data.code}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Estado</dt>
              <dd><StatusBadge status={data.status} /></dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Teléfono de contacto</dt>
              <dd className="tabular">{data.contactPhone}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Obra social</dt>
              <dd>
                {healthInsuranceWithNumber(
                  data.patient.healthInsurance,
                  data.patient.healthInsuranceNumber,
                )}
              </dd>
            </div>
            {/* el paciente lo declaró al reservar y el legajo no lo tiene */}
            {data.contactHealthInsuranceNumber &&
              !data.patient.healthInsuranceNumber &&
              data.contactHealthInsurance?.id === data.patient.healthInsurance?.id && (
                <div className="col-span-2 rounded-(--radius-control) bg-eucalyptus-wash px-3 py-2 text-sm">
                  Al reservar declaró el n.º de afiliado{' '}
                  <span className="font-mono font-medium tabular select-all">
                    {data.contactHealthInsuranceNumber}
                  </span>
                  . Verificalo con la credencial y cargalo en el legajo (Pacientes → Editar).
                </div>
              )}
            <div>
              <dt className="text-sm text-ink-soft">Reservado por</dt>
              <dd>{data.source === 'PUBLICO' ? 'El paciente, por la web' : 'Recepción'}</dd>
            </div>
            {data.cancellationReason && (
              <div className="col-span-2">
                <dt className="text-sm text-ink-soft">Motivo de cancelación</dt>
                <dd>{data.cancellationReason}</dd>
              </div>
            )}
          </dl>
          <div>
            <h3 className="font-bold">Historial</h3>
            <ol className="mt-2 grid gap-2 border-l-2 border-line pl-4">
              {data.history.map((h, i) => (
                <li key={i}>
                  <p>
                    {h.fromStatus === null
                      ? 'Turno reservado'
                      : h.fromDate
                        ? `Reprogramado del ${numericDate(h.fromDate)} ${shortTime(h.fromStartTime!)} al ${numericDate(h.toDate!)} ${shortTime(h.toStartTime!)}`
                        : `${STATUS_LABEL[h.fromStatus]} → ${STATUS_LABEL[h.toStatus]}`}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {dateTime(h.createdAt)}
                    {h.reason && ` — ${h.reason}`}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function RescheduleModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(appointment.date);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!startTime) return;
    setSaving(true);
    setError('');
    try {
      await receptionApi.reschedule(appointment.id, {
        date,
        startTime: shortTime(startTime),
        ...(reason.trim() && { reason: reason.trim() }),
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Reprogramar turno"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button onClick={save} disabled={!startTime} loading={saving}>
            Mover el turno
          </Button>
        </>
      }
    >
      <p className="text-ink-soft">
        {appointment.patient.lastName}, {appointment.patient.firstName} con{' '}
        {appointment.professional.lastName}. Hoy: {numericDate(appointment.date)}{' '}
        {shortTime(appointment.startTime)} h. Conserva el mismo código.
      </p>
      <div className="mt-4 grid gap-4">
        <TextInput
          label="Nueva fecha"
          type="date"
          min={clinicToday()}
          value={date}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setStartTime(null);
          }}
          wrapperClassName="w-48"
        />
        <SlotPicker
          professionalId={appointment.professional.id}
          date={date}
          selected={startTime}
          onSelect={(slot) => setStartTime(slot.startTime)}
        />
        <TextInput label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <ErrorNotice message={error} />}
      </div>
    </Modal>
  );
}

export default AgendaPage;
