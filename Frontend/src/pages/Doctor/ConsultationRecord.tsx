import { useState } from 'react';
import type { Consultation } from '@/interfaces';
import { doctorApi } from '@/services';
import { Button, ErrorNotice, TextArea, TextInput } from '@/components/ui';
import { STUDY_LABEL, dateTime, getErrorMessage, vitalsSummary } from '@/utilities';

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-ink-soft">{title}</h4>
      <p className="mt-0.5 whitespace-pre-line">{text}</p>
    </div>
  );
}

/**
 * Registro de una consulta, solo lectura. Las enmiendas se muestran
 * aparte y fechadas: nunca se mezclan con el texto original.
 */
export function ConsultationRecord({
  consultation: c,
  canAmend = false,
  onAmended,
}: {
  consultation: Consultation;
  canAmend?: boolean;
  onAmended?: (c: Consultation) => void;
}) {
  const vitals = vitalsSummary(c);
  return (
    <div className="grid gap-4">
      <Section title="Motivo de consulta" text={c.reason} />
      <Section title="Anamnesis" text={c.anamnesis} />
      {vitals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">Signos vitales</h4>
          <p className="mt-0.5 tabular">{vitals.join(', ')}</p>
        </div>
      )}
      <Section title="Examen físico" text={c.physicalExam} />
      {c.diagnoses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">Diagnóstico</h4>
          <ul className="mt-0.5 grid gap-0.5">
            {c.diagnoses.map((d) => (
              <li key={d.id}>
                {d.description}
                {d.code && (
                  <span className="ml-1.5 font-mono text-sm text-ink-soft">
                    {d.codeSystem ? `${d.codeSystem} ` : ''}
                    {d.code}
                  </span>
                )}
                {d.type === 'SECUNDARIO' && <span className="ml-1.5 text-sm text-ink-soft">(secundario)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section title="Evolución" text={c.evolution} />
      <Section title="Indicaciones" text={c.indications} />
      {c.medications.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">Medicación</h4>
          <ul className="mt-0.5 grid gap-0.5">
            {c.medications.map((m) => (
              <li key={m.id}>
                <span className="font-medium">{m.drugName}</span>
                {[m.dose, m.frequency, m.duration].filter(Boolean).length > 0 &&
                  ` ${[m.dose, m.frequency, m.duration].filter(Boolean).join(', ')}`}
                {m.notes && <span className="text-ink-soft"> ({m.notes})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.studyRequests.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">Estudios solicitados</h4>
          <ul className="mt-0.5 grid gap-0.5">
            {c.studyRequests.map((s) => (
              <li key={s.id}>
                {STUDY_LABEL[s.type]}: {s.description}
                {s.notes && <span className="text-ink-soft"> ({s.notes})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section title="Observaciones" text={c.observations} />

      {c.amendments.length > 0 && (
        <div className="rounded-(--radius-control) border-l-4 border-st-attention bg-st-attention-wash/60 px-4 py-3">
          <h4 className="font-medium text-st-attention">Enmiendas</h4>
          <ol className="mt-1 grid gap-2">
            {c.amendments.map((a) => (
              <li key={a.id}>
                <p className="whitespace-pre-line">{a.content}</p>
                <p className="text-sm text-ink-soft">
                  {dateTime(a.createdAt)}. Motivo: {a.reason}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {c.finalizedAt && (
        <p className="text-sm text-ink-faint">
          Finalizada el {dateTime(c.finalizedAt)}
          {c.contentHash && (
            <span title="Huella del contenido al finalizar (SHA-256)" className="font-mono">
              {' '}#{c.contentHash.slice(0, 12)}
            </span>
          )}
        </p>
      )}

      {canAmend && onAmended && <AmendmentForm consultationId={c.id} onAmended={onAmended} />}
    </div>
  );
}

function AmendmentForm({
  consultationId,
  onAmended,
}: {
  consultationId: number;
  onAmended: (c: Consultation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Agregar enmienda
        </Button>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onAmended(await doctorApi.amend(consultationId, { content, reason }));
      setOpen(false);
      setContent('');
      setReason('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-3 rounded-(--radius-control) border border-line p-4">
      <p className="text-sm text-ink-soft">
        La consulta original no se modifica: la enmienda queda agregada con fecha, autor y motivo.
      </p>
      <TextArea label="Enmienda" required value={content} onChange={(e) => setContent(e.target.value)} />
      <TextInput label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <ErrorNotice message={error} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>
          Guardar enmienda
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
