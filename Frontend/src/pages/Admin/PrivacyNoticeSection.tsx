import { useState } from 'react';
import Swal from 'sweetalert2';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { AdminPrivacyNotice } from '@/interfaces';
import { Button, ErrorNotice, Notice, Panel, Spinner, TextArea } from '@/components/ui';
import { dateTime, getErrorMessage } from '@/utilities';

/**
 * Aviso de privacidad de la reserva pública (Ley 25.326), administrable desde
 * Configuración. Nunca se edita una versión ya publicada: cada cambio crea
 * una versión nueva y las personas tienen que aceptarla de nuevo. Los textos
 * iniciales son un BORRADOR hasta que los revise un abogado.
 */
export function PrivacyNoticeSection() {
  const versions = useAsync(() => adminApi.privacyNotices(), []);

  if (versions.loading) return <Spinner />;
  if (versions.error || !versions.data?.length)
    return <ErrorNotice message={versions.error || 'No hay versiones del aviso.'} onRetry={versions.reload} />;

  const [current, ...older] = versions.data;
  // key: al publicar cambia la versión vigente y el editor arranca de nuevo con ese texto
  return <PrivacyEditor key={current.version} current={current} older={older} onPublished={versions.reload} />;
}

function PrivacyEditor({
  current,
  older,
  onPublished,
}: {
  current: AdminPrivacyNotice;
  older: AdminPrivacyNotice[];
  onPublished: () => void;
}) {
  const [summary, setSummary] = useState(current.summary);
  const [policy, setPolicy] = useState(current.policy);
  const [isDraft, setIsDraft] = useState(current.draft);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const changed =
    summary.trim() !== current.summary || policy.trim() !== current.policy || isDraft !== current.draft;

  const publish = async () => {
    const ok = await Swal.fire({
      icon: 'question',
      title: `Publicar la versión ${current.version + 1}`,
      text: 'Desde ahora, quien reserve por la web tendrá que aceptar este texto. Las versiones anteriores quedan guardadas.',
      showCancelButton: true,
      confirmButtonText: 'Publicar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    setPublishing(true);
    setError('');
    try {
      await adminApi.publishPrivacyNotice({ summary, policy, isDraft });
      setDone(true);
      onPublished();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  };

  const loadAsBase = (n: AdminPrivacyNotice) => {
    setSummary(n.summary);
    setPolicy(n.policy);
    setIsDraft(n.draft);
    setDone(false);
  };

  return (
    <Panel className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Aviso de privacidad</h2>
        <span className="rounded-full bg-eucalyptus-wash px-2.5 py-0.5 text-sm font-medium text-eucalyptus">
          Versión {current.version} vigente
        </span>
        {current.draft && (
          <span className="rounded-full bg-st-attention-wash px-2.5 py-0.5 text-sm font-medium text-st-attention">
            Borrador
          </span>
        )}
      </div>
      <p className="text-sm text-ink-soft">
        Es lo que ve el paciente al reservar por la web: el aviso breve junto a la casilla de aceptación y la
        política completa en la página pública de privacidad. Cada cambio crea una versión nueva y quien reserve
        tendrá que aceptarla. Los textos de ejemplo son un borrador: tienen que ser revisados por un abogado antes
        de usarse con pacientes.
      </p>

      {current.draft && (
        <Notice>
          La versión vigente es un <strong>borrador pendiente de revisión legal</strong>. Cuando tengas el texto
          definitivo, publicalo con la casilla de borrador desmarcada.
        </Notice>
      )}

      <TextArea
        label="Aviso breve (junto a la casilla de la reserva)"
        rows={5}
        maxLength={2000}
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          setDone(false);
        }}
        hint={`${summary.length} de 2000 caracteres.`}
      />
      <TextArea
        label="Política de privacidad completa (página pública)"
        rows={14}
        maxLength={30000}
        value={policy}
        onChange={(e) => {
          setPolicy(e.target.value);
          setDone(false);
        }}
        hint="Un título numerado («1. Responsable…») seguido de su texto se muestra resaltado. Una línea en blanco separa los apartados."
      />
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-eucalyptus"
          checked={isDraft}
          onChange={(e) => {
            setIsDraft(e.target.checked);
            setDone(false);
          }}
        />
        <span>
          <span className="font-medium">Es un borrador pendiente de revisión legal</span>
          <span className="block text-sm text-ink-soft">
            Mientras esté marcado, la reserva y la página pública avisan que el texto está en revisión.
          </span>
        </span>
      </label>

      {error && <ErrorNotice message={error} />}
      {done && <Notice>Versión publicada.</Notice>}
      <div>
        <Button onClick={publish} loading={publishing} disabled={!changed}>
          Publicar como versión {current.version + 1}
        </Button>
        {!changed && <span className="ml-3 text-sm text-ink-soft">Hacé un cambio para poder publicar.</span>}
      </div>

      <details className="rounded-(--radius-control) border border-line-soft px-4 py-3">
        <summary className="cursor-pointer font-medium">Versiones anteriores ({older.length})</summary>
        {older.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Todavía no hay versiones anteriores.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line-soft">
            {older.map((n) => (
              <li key={n.version} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="font-medium">
                    Versión {n.version}
                    {n.draft && <span className="ml-2 text-sm font-normal text-st-attention">Borrador</span>}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {dateTime(n.publishedAt)}
                    {n.author ? `, por ${n.author}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => loadAsBase(n)}>
                  Usar como base
                </Button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Panel>
  );
}
