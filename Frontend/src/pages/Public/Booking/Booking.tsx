import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { publicApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import type {
  HealthInsurance,
  PatientInput,
  PublicAppointment,
  PublicProfessional,
  Slot,
  Specialty,
} from '@/interfaces';
import { PublicRoutes } from '@/models';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Notice,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { AppointmentTicket } from '@/components/AppointmentTicket';
import { HealthInsuranceSelect } from '@/components/HealthInsuranceSelect';
import { MEMBER_NUMBER_PATTERN, healthInsuranceWithNumber } from '@/utilities';
import {
  addDays,
  clinicToday,
  dateParts,
  dateRange,
  getErrorMessage,
  longDate,
  mondayIndex,
  numericDate,
  shortTime,
} from '@/utilities';

const STEPS = ['Especialidad', 'Profesional', 'Día y hora', 'Tus datos', 'Confirmar'];
/** días de disponibilidad que se piden por tanda */
const RANGE_DAYS = 21;

type Step = 0 | 1 | 2 | 3 | 4;

/**
 * Reserva pública, sin cuenta. Mobile-first: una decisión por pantalla,
 * botones grandes, y el paso actual siempre visible.
 */
export function BookingPage() {
  const [step, setStep] = useState<Step>(0);
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [professional, setProfessional] = useState<PublicProfessional | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [patient, setPatient] = useState<PatientInput>({
    firstName: '',
    lastName: '',
    documentNumber: '',
    phone: '',
    email: '',
  });
  const [booked, setBooked] = useState<PublicAppointment | null>(null);
  const { settings } = useClinicSettings();
  const insurances = useAsync(() => publicApi.healthInsurances(), []);

  const restart = () => {
    setStep(0);
    setSpecialty(null);
    setProfessional(null);
    setSlot(null);
    setBooked(null);
  };

  if (booked) {
    return <BookingDone appointment={booked} onRestart={restart} />;
  }

  if (settings && !settings.publicBookingEnabled) {
    return (
      <div>
        <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Pedí tu turno</h1>
        <div className="mt-6">
          <Notice>
            Por ahora los turnos se dan solo por teléfono
            {settings.contactPhone ? (
              <>
                : <a href={`tel:${settings.contactPhone}`} className="font-medium underline underline-offset-2">{settings.contactPhone}</a>.
              </>
            ) : (
              '. Comunicate con el consultorio.'
            )}{' '}
            Si ya tenés un turno, podés consultarlo o cancelarlo en Mi turno.
          </Notice>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Pedí tu turno</h1>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        Sin registrarte. Al final te damos un código para consultarlo o cancelarlo.
      </p>

      <Stepper step={step} onBack={step > 0 ? () => setStep((step - 1) as Step) : undefined} />

      <div className="mt-6">
        {step === 0 && (
          <SpecialtyStep
            initial={specialty}
            onSelect={(s) => {
              // solo se reinicia lo que sigue si de verdad cambió la elección
              if (s.id !== specialty?.id) {
                setProfessional(null);
                setSlot(null);
              }
              setSpecialty(s);
              setStep(1);
            }}
          />
        )}
        {step === 1 && specialty && (
          <ProfessionalStep
            specialty={specialty}
            initial={professional}
            onSelect={(p) => {
              if (p.id !== professional?.id) setSlot(null);
              setProfessional(p);
              setStep(2);
            }}
          />
        )}
        {step === 2 && professional && (
          <SlotStep
            professional={professional}
            horizonDays={settings?.bookingHorizonDays ?? 90}
            selected={slot}
            onSelect={(s) => {
              setSlot(s);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <PatientStep
            value={patient}
            onChange={setPatient}
            onNext={() => setStep(4)}
            insurances={insurances}
          />
        )}
        {step === 4 && specialty && professional && slot && (
          <ConfirmStep
            specialty={specialty}
            professional={professional}
            slot={slot}
            patient={patient}
            insurances={insurances.data ?? []}
            onEdit={(target) => setStep(target)}
            onBooked={setBooked}
            onSlotTaken={() => {
              setSlot(null);
              setStep(2);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Stepper({ step, onBack }: { step: Step; onBack?: () => void }) {
  return (
    <nav aria-label="Pasos de la reserva" className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">
          <span className="text-ink-soft">
            Paso {step + 1} de {STEPS.length}:
          </span>{' '}
          {STEPS[step]}
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-(--radius-control) px-2 py-1 text-ink-soft hover:bg-line-soft hover:text-ink"
          >
            <ChevronLeftIcon className="size-4" /> Volver
          </button>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`h-1.5 rounded-full ${i <= step ? 'bg-eucalyptus' : 'bg-line'}`}
          />
        ))}
      </ol>
    </nav>
  );
}

/**
 * Desplegable + "Continuar". Antes cada opción era una tarjeta grande: con
 * 3 especialidades se veía bien, pero con 20 o 30 (o muchos médicos) la
 * lista se volvía interminable. El <select> nativo escala: en el celular
 * abre la lista del sistema y en la compu permite tipear la inicial.
 */
function PickStep<T extends { id: number }>({
  label,
  placeholder,
  options,
  optionLabel,
  initialId,
  detail,
  onContinue,
}: {
  label: string;
  placeholder: string;
  options: T[];
  optionLabel: (option: T) => string;
  initialId?: number;
  detail?: (option: T) => string | null;
  onContinue: (option: T) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | ''>(
    initialId && options.some((o) => o.id === initialId) ? initialId : '',
  );
  const selected = options.find((o) => o.id === selectedId) ?? null;
  const selectedDetail = selected && detail ? detail(selected) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onContinue(selected);
      }}
      className="grid gap-4"
    >
      <SelectInput
        label={label}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
        className="text-lg"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {optionLabel(option)}
          </option>
        ))}
      </SelectInput>
      {selectedDetail && (
        <p className="rounded-(--radius-control) bg-sheet px-4 py-3 text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]">
          {selectedDetail}
        </p>
      )}
      <StickyAction>
        <Button type="submit" size="lg" disabled={!selected} className="w-full sm:w-auto">
          Continuar
        </Button>
      </StickyAction>
    </form>
  );
}

function SpecialtyStep({
  initial,
  onSelect,
}: {
  initial: Specialty | null;
  onSelect: (s: Specialty) => void;
}) {
  const { data, loading, error, reload } = useAsync(() => publicApi.specialties(), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!data?.length)
    return (
      <EmptyState title="Todavía no hay especialidades para reservar">
        Comunicate con el consultorio por teléfono.
      </EmptyState>
    );
  return (
    <PickStep
      label="Especialidad"
      placeholder="Elegí una especialidad"
      options={data}
      optionLabel={(s) => s.name}
      initialId={initial?.id}
      detail={(s) => s.description}
      onContinue={onSelect}
    />
  );
}

function ProfessionalStep({
  specialty,
  initial,
  onSelect,
}: {
  specialty: Specialty;
  initial: PublicProfessional | null;
  onSelect: (p: PublicProfessional) => void;
}) {
  const { data, loading, error, reload } = useAsync(
    () => publicApi.professionals(specialty.id),
    [specialty.id],
  );
  if (loading) return <Spinner />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!data?.length)
    return (
      <EmptyState title={`No hay profesionales de ${specialty.name} tomando turnos`}>
        Probá con otra especialidad o comunicate con el consultorio.
      </EmptyState>
    );
  return (
    <PickStep
      label={`Profesional de ${specialty.name}`}
      placeholder="Elegí un profesional"
      options={data}
      optionLabel={(p) => `${p.lastName}, ${p.firstName}`}
      initialId={initial?.id}
      detail={(p) => `Atiende: ${p.specialties.map((s) => s.name).join(', ')}`}
      onContinue={onSelect}
    />
  );
}

function SlotStep({
  professional,
  horizonDays,
  selected,
  onSelect,
}: {
  professional: PublicProfessional;
  horizonDays: number;
  selected: Slot | null;
  onSelect: (s: Slot) => void;
}) {
  const today = clinicToday();
  const [from, setFrom] = useState(today);
  const to = addDays(from, RANGE_DAYS - 1);
  // hasta dónde deja reservar el consultorio (configuración)
  const lastDay = addDays(today, horizonDays);
  const canGoFurther = addDays(from, RANGE_DAYS) <= lastDay;
  const canGoBack = from > today;
  const { data, loading, error, reload } = useAsync(
    () => publicApi.availability(professional.id, from, to),
    [professional.id, from],
  );

  const days = useMemo(() => {
    const byDate = new Map<string, Slot[]>();
    for (const s of data ?? []) {
      byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    }
    return [...byDate.entries()];
  }, [data]);

  const slotsByDate = useMemo(() => new Map(days), [days]);

  const [pickedDate, setPickedDate] = useState<string | null>(selected?.date ?? null);
  const activeDate =
    pickedDate && days.some(([d]) => d === pickedDate) ? pickedDate : (days[0]?.[0] ?? null);
  const activeSlots = days.find(([d]) => d === activeDate)?.[1] ?? [];

  // moverse entre tandas de fechas, hacia adelante y hacia atrás (nunca
  // antes de hoy ni después del horizonte de reserva)
  const goTo = (start: string) => {
    setPickedDate(null);
    setFrom(start < today ? today : start);
  };
  const shownTo = to > lastDay ? lastDay : to;
  const short = (date: string) => {
    const p = dateParts(date);
    return `${p.day} ${p.month}`;
  };

  return (
    <div>
      <p className="text-ink-soft">
        Turnos con{' '}
        <span className="font-medium text-ink">
          {professional.firstName} {professional.lastName}
        </span>
      </p>

      <nav
        aria-label="Fechas"
        className="mt-4 flex items-center justify-between gap-2 border-y border-line-soft py-2"
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoBack || loading}
          onClick={() => goTo(addDays(from, -RANGE_DAYS))}
        >
          <ChevronLeftIcon className="size-4" /> Anteriores
        </Button>
        <span
          className="text-sm whitespace-nowrap text-ink-soft tabular"
          aria-live="polite"
          aria-label={`Fechas del ${short(from)} al ${short(shownTo)}`}
        >
          {short(from)} – {short(shownTo)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoFurther || loading}
          onClick={() => goTo(addDays(from, RANGE_DAYS))}
        >
          Siguientes <ChevronRightIcon className="size-4" />
        </Button>
      </nav>

      {loading ? (
        <Spinner label="Buscando horarios libres…" />
      ) : error ? (
        <div className="mt-4">
          <ErrorNotice message={error} onRetry={reload} />
        </div>
      ) : days.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No hay horarios libres en estas fechas">
            {canGoFurther
              ? 'Probá con las fechas siguientes.'
              : `Se pueden pedir turnos hasta el ${numericDate(lastDay)}. Probá con otro profesional o comunicate con el consultorio.`}
          </EmptyState>
        </div>
      ) : (
        <>
          <DayCalendar
            from={from}
            to={shownTo}
            slotsByDate={slotsByDate}
            activeDate={activeDate}
            onPick={setPickedDate}
          />

          {activeDate && (
            <section className="mt-6" aria-label={`Horarios del ${longDate(activeDate)}`}>
              <h2 className="text-lg font-bold first-letter:uppercase">{longDate(activeDate)}</h2>
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {activeSlots.map((s) => {
                  const isSelected =
                    selected?.date === s.date && selected.startTime === s.startTime;
                  return (
                    <li key={s.startTime}>
                      <button
                        type="button"
                        onClick={() => onSelect(s)}
                        aria-pressed={isSelected}
                        className={`h-12 w-full rounded-(--radius-control) border text-lg font-medium tabular ${isSelected ? 'border-eucalyptus bg-eucalyptus text-white' : 'border-line bg-sheet hover:border-eucalyptus'}`}
                      >
                        {shortTime(s.startTime)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const WEEKDAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

/**
 * Calendario de semanas (lunes a domingo) con TODOS los días del rango.
 * Antes solo se dibujaban los días con horarios libres, así que los que no
 * tenían (domingos, vacaciones, ausencias del profesional) desaparecían sin
 * aviso y el calendario no coincidía con el rango "28 sept – 18 oct" de
 * arriba. Ahora esos días se ven en gris y no se pueden elegir.
 */
function DayCalendar({
  from,
  to,
  slotsByDate,
  activeDate,
  onPick,
}: {
  from: string;
  to: string;
  slotsByDate: Map<string, Slot[]>;
  activeDate: string | null;
  onPick: (date: string) => void;
}) {
  const dates = dateRange(from, to);
  // casilleros vacíos para que el primer día caiga en su columna
  const leading = mondayIndex(from);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1.5 text-center text-sm text-ink-soft" aria-hidden>
        {WEEKDAY_HEADERS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div role="radiogroup" aria-label="Día" className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`empty-${i}`} aria-hidden />
        ))}
        {dates.map((date, i) => {
          const slots = slotsByDate.get(date) ?? [];
          const available = slots.length > 0;
          const active = date === activeDate;
          const parts = dateParts(date);
          // el mes se muestra en el primer día y cada vez que cambia
          const showMonth = i === 0 || parts.day === '1';
          return (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!available}
              aria-label={`${longDate(date)}, ${available ? `${slots.length} horarios libres` : 'sin horarios libres'}`}
              title={available ? undefined : 'Sin horarios libres'}
              onClick={() => onPick(date)}
              className={`flex h-14 flex-col items-center justify-center rounded-(--radius-control) border ${
                active
                  ? 'border-ink bg-ink text-white'
                  : available
                    ? 'border-line bg-sheet hover:border-eucalyptus'
                    : 'cursor-not-allowed border-transparent text-ink-faint/70 line-through'
              }`}
            >
              <span className="text-lg leading-none font-bold tabular">{parts.day}</span>
              {showMonth && (
                <span className={`mt-0.5 text-xs ${active ? 'text-white/80' : 'text-ink-soft'}`}>
                  {parts.month}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Los días tachados no tienen horarios libres (no atiende, o ya está todo ocupado).
      </p>
    </div>
  );
}

type PatientErrors = Partial<Record<keyof PatientInput, string>>;

function validatePatient(p: PatientInput): PatientErrors {
  const errors: PatientErrors = {};
  if (!p.firstName.trim()) errors.firstName = 'Ingresá tu nombre.';
  if (!p.lastName.trim()) errors.lastName = 'Ingresá tu apellido.';
  if (!/^[A-Za-z0-9]{5,20}$/.test(p.documentNumber.replace(/[.\s-]/g, '')))
    errors.documentNumber = 'Ingresá tu DNI (solo números, sin puntos).';
  if (!/^[0-9+()\s-]{6,30}$/.test(p.phone.trim()))
    errors.phone = 'Ingresá un teléfono de contacto.';
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()))
    errors.email = 'Revisá el email.';
  if (p.healthInsuranceId === undefined)
    errors.healthInsuranceId = 'Elegí tu obra social, o "Particular" si no tenés.';
  const memberNumber = p.healthInsuranceNumber?.trim();
  if (p.healthInsuranceId && memberNumber && !MEMBER_NUMBER_PATTERN.test(memberNumber))
    errors.healthInsuranceNumber = 'Revisá el número: solo letras, números, espacios, puntos, barras y guiones.';
  return errors;
}

function PatientStep({
  value,
  onChange,
  onNext,
  insurances,
}: {
  value: PatientInput;
  onChange: (p: PatientInput) => void;
  onNext: () => void;
  insurances: { data: HealthInsurance[] | null; loading: boolean; error: string; reload: () => void };
}) {
  const [errors, setErrors] = useState<PatientErrors>({});
  const set = (field: keyof PatientInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validatePatient(value);
    setErrors(found);
    if (Object.keys(found).length === 0) onNext();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" autoComplete="given-name" value={value.firstName} onChange={set('firstName')} error={errors.firstName} />
        <TextInput label="Apellido" autoComplete="family-name" value={value.lastName} onChange={set('lastName')} error={errors.lastName} />
      </div>
      <TextInput
        label="DNI"
        inputMode="numeric"
        className="font-mono tabular"
        value={value.documentNumber}
        onChange={set('documentNumber')}
        error={errors.documentNumber}
        hint="Lo vas a necesitar, junto con el código, para consultar o cancelar el turno."
      />
      <TextInput label="Teléfono" type="tel" autoComplete="tel" value={value.phone} onChange={set('phone')} error={errors.phone} />
      {insurances.error ? (
        <ErrorNotice message={insurances.error} onRetry={insurances.reload} />
      ) : (
        <HealthInsuranceSelect
          options={insurances.data ?? []}
          value={value.healthInsuranceId}
          onChange={(healthInsuranceId) => onChange({ ...value, healthInsuranceId })}
          error={errors.healthInsuranceId}
          hint={insurances.loading ? 'Cargando la lista…' : 'Si no tenés, elegí "Particular".'}
        />
      )}
      {/* solo con obra social: "Particular" no tiene número de afiliado */}
      {!!value.healthInsuranceId && (
        <TextInput
          label="Número de afiliado (opcional)"
          autoComplete="off"
          className="font-mono tabular"
          value={value.healthInsuranceNumber ?? ''}
          onChange={(e) => onChange({ ...value, healthInsuranceNumber: e.target.value })}
          error={errors.healthInsuranceNumber}
          hint="Está en tu credencial. Si no lo tenés a mano, dejalo vacío: lo completamos en el consultorio."
        />
      )}
      <TextInput
        label="Email (opcional)"
        type="email"
        autoComplete="email"
        value={value.email ?? ''}
        onChange={set('email')}
        error={errors.email}
        hint="Si lo dejás, te mandamos el comprobante."
      />
      <StickyAction>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Revisar el turno
        </Button>
      </StickyAction>
    </form>
  );
}

function ConfirmStep({
  specialty,
  professional,
  slot,
  patient,
  insurances,
  onEdit,
  onBooked,
  onSlotTaken,
}: {
  specialty: Specialty;
  professional: PublicProfessional;
  slot: Slot;
  patient: PatientInput;
  insurances: HealthInsurance[];
  onEdit: (step: Step) => void;
  onBooked: (a: PublicAppointment) => void;
  onSlotTaken: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState(false);

  const confirm = async () => {
    setSending(true);
    setError('');
    try {
      // los opcionales vacíos no se mandan; sin obra social, tampoco el número
      const { email, healthInsuranceNumber, ...rest } = patient;
      const memberNumber = rest.healthInsuranceId ? healthInsuranceNumber?.trim() : '';
      const booked = await publicApi.book({
        professionalId: professional.id,
        specialtyId: specialty.id,
        date: slot.date,
        startTime: shortTime(slot.startTime),
        patient: {
          ...rest,
          ...(email?.trim() && { email: email.trim() }),
          ...(memberNumber && { healthInsuranceNumber: memberNumber }),
        },
      });
      onBooked(booked);
    } catch (err) {
      const message = getErrorMessage(err);
      setTaken(/ya no está disponible/i.test(message));
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const rows: { label: string; value: string; step: Step }[] = [
    { label: 'Especialidad', value: specialty.name, step: 0 },
    { label: 'Profesional', value: `${professional.firstName} ${professional.lastName}`, step: 1 },
    { label: 'Día y hora', value: `${longDate(slot.date)}, ${shortTime(slot.startTime)} h`, step: 2 },
    {
      label: 'Paciente',
      value: `${patient.firstName} ${patient.lastName}, DNI ${patient.documentNumber}`,
      step: 3,
    },
    {
      label: 'Obra social',
      value: healthInsuranceWithNumber(
        patient.healthInsuranceId == null
          ? null
          : (insurances.find((h) => h.id === patient.healthInsuranceId) ?? { name: null }),
        patient.healthInsuranceNumber?.trim(),
      ),
      step: 3,
    },
  ];

  return (
    <div>
      <dl className="divide-y divide-line-soft rounded-(--radius-panel) border border-line bg-sheet">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <dt className="text-sm text-ink-soft">{r.label}</dt>
              <dd className="mt-0.5 font-medium first-letter:uppercase">{r.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              className="shrink-0 rounded-(--radius-control) px-2 py-1 text-eucalyptus hover:bg-eucalyptus-wash"
            >
              Cambiar
            </button>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mt-4">
          <ErrorNotice message={error} />
          {taken && (
            <Button variant="secondary" className="mt-3" onClick={onSlotTaken}>
              Elegir otro horario
            </Button>
          )}
        </div>
      )}

      <StickyAction>
        <Button size="lg" className="w-full sm:w-auto" onClick={confirm} loading={sending}>
          Confirmar turno
        </Button>
      </StickyAction>
    </div>
  );
}

function BookingDone({
  appointment,
  onRestart,
}: {
  appointment: PublicAppointment;
  onRestart: () => void;
}) {
  return (
    <div>
      <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Tu turno quedó reservado</h1>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        Guardá el código: con él y tu DNI podés consultar o cancelar el turno.
      </p>
      <div className="mt-8">
        <AppointmentTicket appointment={appointment} animate />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          Pedir otro turno
        </Button>
      </div>
      <p className="mt-6 text-center text-ink-soft">
        ¿Necesitás cancelarlo?{' '}
        <Link to={`/${PublicRoutes.MY_APPOINTMENT}`} className="text-eucalyptus underline underline-offset-2">
          Andá a Mi turno
        </Link>
      </p>
    </div>
  );
}

/** En el celular, la acción principal queda fija abajo, al alcance del pulgar. */
function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0">
      {children}
    </div>
  );
}

export default BookingPage;
