import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Schedule, ScheduleException, ScheduleExceptionType } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import {
  EXCEPTION_LABEL,
  WEEKDAYS,
  clinicToday,
  getErrorMessage,
  numericDate,
  shortTime,
  showError,
} from '@/utilities';

const SLOT_OPTIONS = [15, 20, 30, 45, 60];

/**
 * Agenda de un profesional: horario semanal recurrente + excepciones
 * (ausencias que quitan turnos, horarios especiales que los agregan).
 */
export function SchedulesPage() {
  const [params, setParams] = useSearchParams();
  const professionalId = Number(params.get('profesional')) || 0;
  const professionals = useAsync(() => adminApi.professionals(), []);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Horarios y ausencias"
        description="Lo que se carga acá define qué turnos ven los pacientes y recepción."
      />
      <SelectInput
        label="Profesional"
        value={professionalId || ''}
        onChange={(e) => setParams(e.target.value ? { profesional: e.target.value } : {})}
        wrapperClassName="max-w-sm mb-6"
      >
        <option value="">Elegí un profesional</option>
        {(professionals.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.lastName}, {p.firstName}
          </option>
        ))}
      </SelectInput>

      {professionalId ? (
        <div className="grid gap-8">
          <WeeklySchedule professionalId={professionalId} />
          <Exceptions professionalId={professionalId} />
        </div>
      ) : (
        <EmptyState title="Elegí un profesional para ver y cargar su agenda" />
      )}
    </div>
  );
}

function WeeklySchedule({ professionalId }: { professionalId: number }) {
  const list = useAsync(() => adminApi.schedules(professionalId), [professionalId]);
  const [adding, setAdding] = useState(false);

  const deactivate = async (s: Schedule) => {
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Desactivar horario',
      text: 'Deja de ofrecer turnos nuevos en esta franja. Los turnos ya dados no se tocan.',
      showCancelButton: true,
      confirmButtonText: 'Desactivar',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    try {
      await adminApi.updateSchedule(s.id, { active: false });
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const active = (list.data ?? []).filter((s) => s.active);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Horario semanal</h2>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Agregar franja
        </Button>
      </div>
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !active.length ? (
        <EmptyState title="Sin horario cargado">
          Sin franjas semanales, este profesional no tiene turnos para ofrecer.
        </EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {WEEKDAYS.map(({ value, label }) => {
              const day = active.filter((s) => s.weekday === value);
              if (!day.length) return null;
              return (
                <li key={value} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[8rem_1fr]">
                  <span className="font-medium">{label}</span>
                  <ul className="grid gap-1.5">
                    {day.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-mono font-semibold tabular">
                            {shortTime(s.startTime)}–{shortTime(s.endTime)}
                          </span>{' '}
                          <span className="text-ink-soft">
                            turnos de {s.slotMinutes} min, {s.office?.name}
                            {s.validUntil
                              ? `, del ${numericDate(s.validFrom)} al ${numericDate(s.validUntil)}`
                              : s.validFrom > clinicToday()
                                ? `, desde el ${numericDate(s.validFrom)}`
                                : ''}
                          </span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => deactivate(s)}>
                          Desactivar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {adding && (
        <ScheduleModal
          professionalId={professionalId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
    </section>
  );
}

function ScheduleModal({
  professionalId,
  onClose,
  onSaved,
}: {
  professionalId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const offices = useAsync(() => adminApi.offices(), []);
  const [form, setForm] = useState({
    officeId: '',
    weekday: '1',
    startTime: '08:00',
    endTime: '12:00',
    slotMinutes: '30',
    validFrom: clinicToday(),
    validUntil: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [field]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.createSchedule({
        professionalId,
        officeId: Number(form.officeId),
        weekday: Number(form.weekday),
        startTime: form.startTime,
        endTime: form.endTime,
        slotMinutes: Number(form.slotMinutes),
        validFrom: form.validFrom,
        ...(form.validUntil && { validUntil: form.validUntil }),
      });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar franja semanal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="schedule-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Día" value={form.weekday} onChange={set('weekday')}>
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </SelectInput>
        <SelectInput label="Consultorio" required value={form.officeId} onChange={set('officeId')}>
          <option value="">Elegí un consultorio</option>
          {(offices.data ?? []).filter((o) => o.active).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </SelectInput>
        <TextInput label="Desde" type="time" required value={form.startTime} onChange={set('startTime')} />
        <TextInput label="Hasta" type="time" required value={form.endTime} onChange={set('endTime')} />
        <SelectInput label="Duración de cada turno" value={form.slotMinutes} onChange={set('slotMinutes')}>
          {SLOT_OPTIONS.map((m) => (
            <option key={m} value={m}>{m} minutos</option>
          ))}
        </SelectInput>
        <div />
        <TextInput label="Vigente desde" type="date" required value={form.validFrom} onChange={set('validFrom')} />
        <TextInput
          label="Vigente hasta (opcional)"
          type="date"
          value={form.validUntil}
          onChange={set('validUntil')}
          hint="Vacío: sin fecha de fin."
        />
        {error && (
          <div className="sm:col-span-2">
            <ErrorNotice message={error} />
          </div>
        )}
      </form>
    </Modal>
  );
}

function Exceptions({ professionalId }: { professionalId: number }) {
  const list = useAsync(
    () => adminApi.exceptions({ professionalId, from: clinicToday() }),
    [professionalId],
  );
  const [adding, setAdding] = useState(false);

  const deactivate = async (e: ScheduleException) => {
    try {
      await adminApi.setExceptionActive(e.id, false);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const active = (list.data ?? []).filter((e) => e.active);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Ausencias y horarios especiales</h2>
          <p className="text-ink-soft">Próximos. Los feriados cargados para todos también aparecen acá.</p>
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Cargar
        </Button>
      </div>
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !active.length ? (
        <EmptyState title="Sin ausencias ni horarios especiales próximos" />
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {active.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="font-medium">
                    {EXCEPTION_LABEL[e.type]}
                    {e.professionalId === null && (
                      <span className="font-normal text-ink-soft"> (todos los profesionales)</span>
                    )}
                  </p>
                  <p className="text-ink-soft tabular">
                    {e.startDate === e.endDate
                      ? numericDate(e.startDate)
                      : `Del ${numericDate(e.startDate)} al ${numericDate(e.endDate)}`}
                    {e.startTime ? `, de ${shortTime(e.startTime)} a ${shortTime(e.endTime!)}` : ', todo el día'}
                    {e.reason && ` — ${e.reason}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deactivate(e)}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {adding && (
        <ExceptionModal
          professionalId={professionalId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
    </section>
  );
}

function ExceptionModal({
  professionalId,
  onClose,
  onSaved,
}: {
  professionalId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const offices = useAsync(() => adminApi.offices(), []);
  const [form, setForm] = useState({
    type: 'VACACIONES' as ScheduleExceptionType,
    forEveryone: false,
    startDate: clinicToday(),
    endDate: clinicToday(),
    wholeDay: true,
    startTime: '09:00',
    endTime: '10:00',
    officeId: '',
    slotMinutes: '30',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const special = form.type === 'HORARIO_ESPECIAL';
  const withTimes = special || !form.wholeDay;

  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({
        ...form,
        [field]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
      });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.createException({
        type: form.type,
        ...(!(form.forEveryone && !special) && { professionalId }),
        startDate: form.startDate,
        endDate: form.endDate,
        ...(withTimes && { startTime: form.startTime, endTime: form.endTime }),
        ...(special && { officeId: Number(form.officeId), slotMinutes: Number(form.slotMinutes) }),
        ...(form.reason.trim() && { reason: form.reason.trim() }),
      });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar ausencia u horario especial"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="exception-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="exception-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="Tipo"
          value={form.type}
          onChange={set('type')}
          wrapperClassName="sm:col-span-2"
          hint={special ? 'Agrega turnos fuera del horario semanal (ej. un sábado puntual).' : 'Quita turnos en ese período.'}
        >
          {Object.entries(EXCEPTION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectInput>
        {!special && (
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input type="checkbox" className="size-4 accent-eucalyptus" checked={form.forEveryone} onChange={set('forEveryone')} />
            Aplica a todos los profesionales (ej. feriado)
          </label>
        )}
        <TextInput label="Desde el día" type="date" required value={form.startDate} onChange={set('startDate')} />
        <TextInput label="Hasta el día" type="date" required value={form.endDate} onChange={set('endDate')} />
        {!special && (
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input type="checkbox" className="size-4 accent-eucalyptus" checked={form.wholeDay} onChange={set('wholeDay')} />
            Días completos
          </label>
        )}
        {withTimes && (
          <>
            <TextInput label="Desde la hora" type="time" required value={form.startTime} onChange={set('startTime')} />
            <TextInput label="Hasta la hora" type="time" required value={form.endTime} onChange={set('endTime')} />
          </>
        )}
        {special && (
          <>
            <SelectInput label="Consultorio" required value={form.officeId} onChange={set('officeId')}>
              <option value="">Elegí un consultorio</option>
              {(offices.data ?? []).filter((o) => o.active).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </SelectInput>
            <SelectInput label="Duración de cada turno" value={form.slotMinutes} onChange={set('slotMinutes')}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} minutos</option>
              ))}
            </SelectInput>
          </>
        )}
        <TextInput
          label="Motivo (opcional)"
          value={form.reason}
          onChange={set('reason')}
          wrapperClassName="sm:col-span-2"
        />
        {error && (
          <div className="sm:col-span-2">
            <ErrorNotice message={error} />
          </div>
        )}
      </form>
    </Modal>
  );
}

export default SchedulesPage;
