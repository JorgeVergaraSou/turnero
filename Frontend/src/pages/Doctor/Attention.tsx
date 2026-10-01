import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { doctorApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type {
  Consultation,
  ConsultationUpdate,
  Diagnosis,
  Medication,
  StudyRequest,
  VitalSigns,
} from '@/interfaces';
import { StaffPaths } from '@/models';
import {
  Button,
  ErrorNotice,
  Panel,
  SelectInput,
  Spinner,
  TextArea,
  TextInput,
  controlClass,
} from '@/components/ui';
import { ClinicalHistory } from './ClinicalHistory';
import { ConsultationRecord } from './ConsultationRecord';
import {
  STUDY_LABEL,
  ageFrom,
  clinicTime,
  getErrorMessage,
  numericDate,
  shortTime,
  showError,
  showSuccess,
} from '@/utilities';

const TEXT_FIELDS = [
  'reason',
  'anamnesis',
  'physicalExam',
  'evolution',
  'indications',
  'observations',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const VITALS: { key: keyof VitalSigns; label: string; unit: string; step: string }[] = [
  { key: 'systolicBp', label: 'TA sistólica', unit: 'mmHg', step: '1' },
  { key: 'diastolicBp', label: 'TA diastólica', unit: 'mmHg', step: '1' },
  { key: 'heartRate', label: 'Frec. cardíaca', unit: 'lpm', step: '1' },
  { key: 'temperatureC', label: 'Temperatura', unit: '°C', step: '0.1' },
  { key: 'oxygenSaturation', label: 'Saturación', unit: '%', step: '1' },
  { key: 'weightKg', label: 'Peso', unit: 'kg', step: '0.1' },
  { key: 'heightCm', label: 'Talla', unit: 'cm', step: '0.1' },
];

/** Dos filas agrupadas por lo que miden (en una sola fila de 7 quedaban apretados). */
const VITAL_GROUPS: { title: string; keys: (keyof VitalSigns)[] }[] = [
  { title: 'Presión, pulso y saturación', keys: ['systolicBp', 'diastolicBp', 'heartRate', 'oxygenSaturation'] },
  { title: 'Temperatura y medidas', keys: ['temperatureC', 'weightKg', 'heightCm'] },
];

interface Draft {
  text: Record<TextField, string>;
  vitals: Record<keyof VitalSigns, string>;
  diagnoses: Diagnosis[];
  medications: Medication[];
  studyRequests: StudyRequest[];
}

function toDraft(c: Consultation): Draft {
  return {
    text: Object.fromEntries(TEXT_FIELDS.map((f) => [f, c[f] ?? ''])) as Record<TextField, string>,
    vitals: Object.fromEntries(
      VITALS.map(({ key }) => [key, c.vitalSigns[key] === null ? '' : String(c.vitalSigns[key])]),
    ) as Record<keyof VitalSigns, string>,
    diagnoses: c.diagnoses.map(({ type, description, codeSystem, code }) => ({ type, description, codeSystem, code })),
    medications: c.medications.map(({ drugName, dose, frequency, duration, notes }) => ({ drugName, dose, frequency, duration, notes })),
    studyRequests: c.studyRequests.map(({ type, description, notes }) => ({ type, description, notes })),
  };
}

const blankToNull = (v?: string | null) => (v?.trim() ? v.trim() : null);
const blankToUndefined = (v?: string | null) => (v?.trim() ? v.trim() : undefined);

function toPayload(d: Draft): ConsultationUpdate {
  const payload: ConsultationUpdate = {};
  for (const f of TEXT_FIELDS) payload[f] = blankToNull(d.text[f]);
  for (const { key } of VITALS) {
    const raw = d.vitals[key].replace(',', '.').trim();
    payload[key] = raw === '' ? null : Number(raw);
  }
  // filas vacías no se mandan; opcionales vacíos van omitidos
  payload.diagnoses = d.diagnoses
    .filter((x) => x.description.trim())
    .map((x) => ({
      type: x.type,
      description: x.description.trim(),
      codeSystem: blankToUndefined(x.code) ? blankToUndefined(x.codeSystem) ?? 'CIE-10' : undefined,
      code: blankToUndefined(x.code),
    }));
  payload.medications = d.medications
    .filter((x) => x.drugName.trim())
    .map((x) => ({
      drugName: x.drugName.trim(),
      dose: blankToUndefined(x.dose),
      frequency: blankToUndefined(x.frequency),
      duration: blankToUndefined(x.duration),
      notes: blankToUndefined(x.notes),
    }));
  payload.studyRequests = d.studyRequests
    .filter((x) => x.description.trim())
    .map((x) => ({ type: x.type, description: x.description.trim(), notes: blankToUndefined(x.notes) }));
  return payload;
}

/**
 * Atención en curso. A la izquierda el paciente y su historia (para
 * consultar sin salir); a la derecha la consulta nueva. Guardar borrador
 * con Ctrl+S; finalizar la vuelve inmutable.
 */
export function AttentionPage() {
  const appointmentId = Number(useParams().appointmentId);

  // Iniciar es idempotente: si ya está en atención devuelve la misma
  // consulta. Si el turno ya fue atendido, se muestra la consulta final.
  const session = useAsync(async () => {
    try {
      return await doctorApi.start(appointmentId);
    } catch (startError) {
      try {
        return await doctorApi.consultationOfAppointment(appointmentId);
      } catch {
        throw startError;
      }
    }
  }, [appointmentId]);
  const me = useAsync(() => doctorApi.me(), []);

  if (session.loading) return <Spinner label="Abriendo la atención…" />;
  if (session.error || !session.data)
    return (
      <div className="max-w-xl">
        <ErrorNotice message={session.error || 'No se pudo abrir la atención'} />
        <Link to={StaffPaths.DOCTOR_HOME} className="mt-4 inline-block text-eucalyptus underline underline-offset-2">
          Volver a los turnos de hoy
        </Link>
      </div>
    );

  return (
    <AttentionWorkspace
      key={session.data.id}
      initial={session.data}
      myProfessionalId={me.data?.id}
    />
  );
}

function AttentionWorkspace({
  initial,
  myProfessionalId,
}: {
  initial: Consultation;
  myProfessionalId?: number;
}) {
  const [consultation, setConsultation] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const patient = useAsync(() => doctorApi.patient(initial.patientId), [initial.patientId]);
  const finalized = consultation.status === 'FINALIZADA';

  const update = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setDirty(true);
  };

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      const saved = await doctorApi.saveDraft(consultation.id, toPayload(draft));
      setConsultation(saved);
      setDirty(false);
      setSavedAt(shortTime(clinicTime()));
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [consultation.id, draft]);

  // Ctrl/Cmd + S guarda el borrador
  useEffect(() => {
    if (finalized) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, saving, finalized]);

  // aviso del navegador si se cierra con cambios sin guardar
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const finalize = async () => {
    if (!draft.text.reason.trim()) {
      setError('Para finalizar, completá al menos el motivo de consulta.');
      return;
    }
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Finalizar consulta',
      text: 'Una vez finalizada no se puede editar: las correcciones se agregan como enmiendas. El turno queda como atendido.',
      showCancelButton: true,
      confirmButtonText: 'Finalizar consulta',
      cancelButtonText: 'Seguir editando',
    });
    if (!isConfirmed) return;
    if (dirty && !(await save())) return;
    try {
      setSaving(true);
      const done = await doctorApi.finalize(consultation.id);
      setConsultation(done);
      setDirty(false);
      showSuccess('Consulta finalizada', 'Quedó registrada en la historia clínica del paciente.');
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo finalizar');
    } finally {
      setSaving(false);
    }
  };

  const p = patient.data;
  const age = p ? ageFrom(p.birthDate) : null;

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <aside className="grid content-start gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <Panel className="p-5">
          {patient.loading ? (
            <Spinner />
          ) : patient.error ? (
            <ErrorNotice message={patient.error} />
          ) : p ? (
            <>
              <h1 className="text-xl font-bold">
                {p.firstName} {p.lastName}
              </h1>
              <p className="mt-1 text-ink-soft">
                {age !== null ? `${age} años` : 'Edad sin cargar'}
                {p.birthDate && `, nació el ${numericDate(p.birthDate)}`}
              </p>
              <p className="mt-2 font-mono text-sm tabular">DNI {p.documentNumber}</p>
              <p className="text-sm tabular">Tel. {p.phone}</p>
              <Link
                to={StaffPaths.doctorPatient(p.id)}
                className="mt-3 inline-block text-sm text-eucalyptus underline underline-offset-2"
              >
                Abrir historia completa
              </Link>
            </>
          ) : null}
        </Panel>
        <section aria-label="Consultas anteriores">
          <h2 className="mb-2 font-bold">Consultas anteriores</h2>
          <ClinicalHistory
            patientId={initial.patientId}
            myProfessionalId={myProfessionalId}
            excludeConsultationId={consultation.id}
            compact
          />
        </section>
      </aside>

      <div className="min-w-0">
        {finalized ? (
          <Panel className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Consulta finalizada</h2>
              <Link
                to={StaffPaths.DOCTOR_HOME}
                className="inline-flex h-10 items-center rounded-(--radius-control) bg-eucalyptus px-4 font-medium text-white hover:bg-eucalyptus-dark"
              >
                Volver a los turnos de hoy
              </Link>
            </div>
            <ConsultationRecord
              consultation={consultation}
              canAmend={myProfessionalId === consultation.professional.id}
              onAmended={setConsultation}
            />
          </Panel>
        ) : (
          <ConsultationForm draft={draft} update={update} />
        )}
      </div>

      {!finalized && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-sheet/95 backdrop-blur lg:left-[15.5rem]">
          <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-8">
            {error && <p role="alert" className="mr-auto text-st-cancelled">{error}</p>}
            {!error && (
              <p className="mr-auto text-sm text-ink-soft" aria-live="polite">
                {dirty ? 'Cambios sin guardar (Ctrl+S para guardar)' : savedAt ? `Borrador guardado a las ${savedAt}` : 'Borrador'}
              </p>
            )}
            <Button variant="secondary" onClick={save} loading={saving && dirty} disabled={!dirty}>
              Guardar borrador
            </Button>
            <Button onClick={finalize} loading={saving && !dirty}>
              Finalizar consulta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsultationForm({
  draft,
  update,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
}) {
  const setText = (field: TextField) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    update((d) => ({ ...d, text: { ...d.text, [field]: value } }));
  };

  const setListItem = <K extends 'diagnoses' | 'medications' | 'studyRequests'>(
    list: K,
    index: number,
    patch: Partial<Draft[K][number]>,
  ) =>
    update((d) => ({
      ...d,
      [list]: (d[list] as Draft[K][number][]).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const removeListItem = (list: 'diagnoses' | 'medications' | 'studyRequests', index: number) =>
    update((d) => ({ ...d, [list]: (d[list] as unknown[]).filter((_, i) => i !== index) }));

  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-bold">Nueva consulta</h2>

      <Panel className="grid gap-5 p-5 sm:p-6">
        <TextArea label="Motivo de consulta" rows={2} value={draft.text.reason} onChange={setText('reason')} autoFocus />
        <TextArea label="Anamnesis" rows={4} value={draft.text.anamnesis} onChange={setText('anamnesis')} />

        <fieldset>
          <legend className="text-sm font-medium">Signos vitales</legend>
          <div className="mt-2 grid gap-4">
            {VITAL_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-faint uppercase">{group.title}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {VITALS.filter((v) => group.keys.includes(v.key)).map((v) => (
                    <label key={v.key} className="grid gap-1 text-sm text-ink-soft">
                      <span className="whitespace-nowrap">{v.label}</span>
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          step={v.step}
                          value={draft.vitals[v.key]}
                          onChange={(e) => {
                            const value = e.target.value;
                            update((d) => ({ ...d, vitals: { ...d.vitals, [v.key]: value } }));
                          }}
                          // sin las flechitas: se escribe el número, y ocupaban medio campo
                          className={`${controlClass} h-10 min-w-0 font-mono text-ink tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                        />
                        <span className="w-10 shrink-0">{v.unit}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <TextArea label="Examen físico" rows={4} value={draft.text.physicalExam} onChange={setText('physicalExam')} />
      </Panel>

      <Panel className="grid gap-3 p-5 sm:p-6">
        <h3 className="font-bold">Diagnóstico</h3>
        {draft.diagnoses.map((dx, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_7rem_auto] sm:items-end">
            <SelectInput
              label="Tipo"
              value={dx.type}
              onChange={(e) => setListItem('diagnoses', i, { type: e.target.value as Diagnosis['type'] })}
            >
              <option value="PRINCIPAL">Principal</option>
              <option value="SECUNDARIO">Secundario</option>
            </SelectInput>
            <TextInput
              label="Descripción"
              value={dx.description}
              onChange={(e) => setListItem('diagnoses', i, { description: e.target.value })}
            />
            <TextInput
              label="CIE-10"
              className="font-mono uppercase"
              placeholder="J02.9"
              value={dx.code ?? ''}
              onChange={(e) => setListItem('diagnoses', i, { code: e.target.value.toUpperCase() })}
            />
            <RemoveButton label="Quitar diagnóstico" onClick={() => removeListItem('diagnoses', i)} />
          </div>
        ))}
        <AddButton
          onClick={() =>
            update((d) => ({
              ...d,
              diagnoses: [...d.diagnoses, { type: d.diagnoses.length ? 'SECUNDARIO' : 'PRINCIPAL', description: '' }],
            }))
          }
        >
          Agregar diagnóstico
        </AddButton>
      </Panel>

      <Panel className="grid gap-5 p-5 sm:p-6">
        <TextArea label="Evolución" rows={3} value={draft.text.evolution} onChange={setText('evolution')} />
        <TextArea label="Indicaciones al paciente" rows={3} value={draft.text.indications} onChange={setText('indications')} />
      </Panel>

      <Panel className="grid gap-3 p-5 sm:p-6">
        <h3 className="font-bold">Medicación</h3>
        {draft.medications.map((m, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
            <TextInput label="Medicamento" value={m.drugName} onChange={(e) => setListItem('medications', i, { drugName: e.target.value })} />
            <TextInput label="Dosis" placeholder="400 mg" value={m.dose ?? ''} onChange={(e) => setListItem('medications', i, { dose: e.target.value })} />
            <TextInput label="Frecuencia" placeholder="cada 8 h" value={m.frequency ?? ''} onChange={(e) => setListItem('medications', i, { frequency: e.target.value })} />
            <TextInput label="Duración" placeholder="5 días" value={m.duration ?? ''} onChange={(e) => setListItem('medications', i, { duration: e.target.value })} />
            <RemoveButton label="Quitar medicamento" onClick={() => removeListItem('medications', i)} />
          </div>
        ))}
        <AddButton onClick={() => update((d) => ({ ...d, medications: [...d.medications, { drugName: '' }] }))}>
          Agregar medicamento
        </AddButton>
      </Panel>

      <Panel className="grid gap-3 p-5 sm:p-6">
        <h3 className="font-bold">Estudios solicitados</h3>
        {draft.studyRequests.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
            <SelectInput
              label="Tipo"
              value={s.type}
              onChange={(e) => setListItem('studyRequests', i, { type: e.target.value as StudyRequest['type'] })}
            >
              {Object.entries(STUDY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
            <TextInput
              label="Detalle"
              placeholder="Hemograma completo"
              value={s.description}
              onChange={(e) => setListItem('studyRequests', i, { description: e.target.value })}
            />
            <RemoveButton label="Quitar estudio" onClick={() => removeListItem('studyRequests', i)} />
          </div>
        ))}
        <AddButton
          onClick={() =>
            update((d) => ({ ...d, studyRequests: [...d.studyRequests, { type: 'LABORATORIO', description: '' }] }))
          }
        >
          Agregar estudio
        </AddButton>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <TextArea label="Observaciones" rows={3} value={draft.text.observations} onChange={setText('observations')} />
      </Panel>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div>
      <Button size="sm" variant="ghost" onClick={onClick} className="text-eucalyptus">
        <PlusIcon className="size-4" /> {children}
      </Button>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" aria-label={label} title={label} onClick={onClick} className="h-11 text-ink-soft">
      <TrashIcon className="size-5" />
    </Button>
  );
}

export default AttentionPage;
