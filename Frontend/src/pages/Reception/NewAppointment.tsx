import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Appointment, Patient } from '@/interfaces';
import { StaffPaths } from '@/models';
import {
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  SearchInput,
  TextInput,
} from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { PatientFormModal } from './PatientForm';
import { clinicToday, formatCode, getErrorMessage, longDate, shortTime } from '@/utilities';

/**
 * Dar turno desde recepción (teléfono o mostrador). Tres bloques en una
 * sola pantalla — recepción conoce el flujo y necesita velocidad, no un
 * asistente paso a paso como el del paciente.
 */
export function NewAppointmentPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [specialtyId, setSpecialtyId] = useState<number | ''>('');
  const [professionalId, setProfessionalId] = useState<number | ''>('');
  const [date, setDate] = useState(clinicToday());
  const [startTime, setStartTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);

  const specialties = useAsync(() => publicApi.specialties(), []);
  const professionals = useAsync(
    () => publicApi.professionals(Number(specialtyId)),
    [specialtyId],
    !!specialtyId,
  );

  const book = async () => {
    if (!patient || !specialtyId || !professionalId || !startTime) return;
    setSaving(true);
    setError('');
    try {
      setBooked(
        await receptionApi.book({
          patientId: patient.id,
          specialtyId: Number(specialtyId),
          professionalId: Number(professionalId),
          date,
          startTime: shortTime(startTime),
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
      setStartTime(null);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBooked(null);
    setPatient(null);
    setStartTime(null);
  };

  if (booked) {
    return (
      <div className="max-w-xl">
        <PageHeader title="Turno dado" />
        <Panel className="p-6">
          <p className="text-ink-soft">
            {booked.patient.lastName}, {booked.patient.firstName}
          </p>
          <p className="mt-2 text-3xl font-bold tabular">{shortTime(booked.startTime)} h</p>
          <p className="text-lg first-letter:uppercase">{longDate(booked.date)}</p>
          <p className="mt-2">
            {booked.professional.lastName}, {booked.professional.firstName} ({booked.specialty.name}),{' '}
            {booked.office.name}
          </p>
          <p className="mt-4 text-sm text-ink-soft">Código para el paciente</p>
          <p className="font-mono text-2xl font-semibold tracking-[0.12em] tabular select-all">
            {formatCode(booked.code)}
          </p>
        </Panel>
        <div className="mt-5 flex gap-2">
          <Button onClick={reset}>Dar otro turno</Button>
          <Link
            to={StaffPaths.AGENDA}
            className="inline-flex h-10 items-center rounded-(--radius-control) border border-line bg-sheet px-4 font-medium hover:border-ink-soft"
          >
            Ir a la agenda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Dar turno" />

      <div className="grid gap-5">
        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">Paciente</h2>
          {patient ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {patient.lastName}, {patient.firstName}
                </p>
                <p className="font-mono text-sm text-ink-soft tabular">
                  DNI {patient.documentNumber}, tel. {patient.phone}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setPatient(null)}>
                Cambiar paciente
              </Button>
            </div>
          ) : (
            <PatientPicker onPick={setPatient} />
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">Profesional</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Especialidad"
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value ? Number(e.target.value) : '');
                setProfessionalId('');
                setStartTime(null);
              }}
            >
              <option value="">Elegí una especialidad</option>
              {(specialties.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              label="Profesional"
              value={professionalId}
              disabled={!specialtyId}
              onChange={(e) => {
                setProfessionalId(e.target.value ? Number(e.target.value) : '');
                setStartTime(null);
              }}
            >
              <option value="">{specialtyId ? 'Elegí un profesional' : 'Primero la especialidad'}</option>
              {(professionals.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </SelectInput>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 text-lg font-bold">Día y hora</h2>
          {professionalId ? (
            <div className="grid gap-4">
              <TextInput
                label="Fecha"
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
                professionalId={Number(professionalId)}
                date={date}
                selected={startTime}
                onSelect={(slot) => setStartTime(slot.startTime)}
              />
            </div>
          ) : (
            <p className="text-ink-soft">Elegí el profesional para ver sus horarios libres.</p>
          )}
        </Panel>

        {error && <ErrorNotice message={error} />}

        <div>
          <Button
            size="lg"
            onClick={book}
            loading={saving}
            disabled={!patient || !professionalId || !startTime}
          >
            {startTime ? `Dar turno ${shortTime(startTime)} h` : 'Dar turno'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Buscar por DNI o nombre; si no existe, crearlo en el momento. */
function PatientPicker({ onPick }: { onPick: (p: Patient) => void }) {
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim());
  const [creating, setCreating] = useState(false);
  const results = useAsync(() => receptionApi.searchPatients(term), [term], term.length >= 2);

  return (
    <div>
      <SearchInput
        label="Buscar por DNI, nombre o apellido"
        value={q}
        onChange={setQ}
        searching={results.loading || (q.trim().length >= 2 && q.trim() !== term)}
        hint="Escribí al menos 2 letras o números: los resultados aparecen mientras escribís."
        autoFocus
      />

      {term.length >= 2 && (
        <div className="mt-3">
          {results.loading && !results.data ? (
            <Spinner />
          ) : results.error ? (
            <ErrorNotice message={results.error} />
          ) : results.data?.items.length ? (
            <ul
              className={`divide-y divide-line-soft rounded-(--radius-control) border border-line transition-opacity ${results.loading ? 'opacity-60' : ''}`}
            >
              {results.data.items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-eucalyptus-wash/50"
                  >
                    <span className="font-medium">
                      {p.lastName}, {p.firstName}
                    </span>
                    <span className="font-mono text-sm text-ink-soft tabular">DNI {p.documentNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No encontramos pacientes con esa búsqueda"
              action={<Button onClick={() => setCreating(true)}>Cargar paciente nuevo</Button>}
            />
          )}
        </div>
      )}

      {term.length < 2 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-3 text-eucalyptus underline underline-offset-2"
        >
          Es un paciente nuevo
        </button>
      )}

      {creating && (
        <PatientFormModal
          open
          initialDocument={/^\d+$/.test(term.replace(/\./g, '')) ? term.replace(/\./g, '') : ''}
          onClose={() => setCreating(false)}
          onSaved={(p) => {
            setCreating(false);
            onPick(p);
          }}
        />
      )}
    </div>
  );
}

export default NewAppointmentPage;
