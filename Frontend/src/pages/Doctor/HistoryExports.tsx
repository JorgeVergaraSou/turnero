import { useState } from 'react';
import { doctorApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { HistoryExport, HistoryExportScope } from '@/interfaces';
import { Button, EmptyState, ErrorNotice, Modal, Notice, PageHeader, Panel, Spinner } from '@/components/ui';
import { HistoryExportDue, HistoryExportStatusBadge } from '@/components/HistoryExportParts';
import { dateTime, getErrorMessage, showError, showSuccess } from '@/utilities';

/** Baja un Blob como archivo sin dejarlo en ninguna URL pública. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Copias de historia clínica que el paciente pidió y le asignaron a este
 * médico. El PDF se genera en el momento (no queda guardado en el servidor):
 * cada vez que se genera queda registrado, con su huella, y la entrega se
 * confirma acá. Plazo legal: 48 horas desde el pedido.
 */
export function DoctorHistoryExportsPage() {
  const [scope, setScope] = useState<HistoryExportScope>('open');
  const [issuing, setIssuing] = useState<HistoryExport | null>(null);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const list = useAsync(() => doctorApi.historyExports(scope), [scope]);

  const deliver = async (item: HistoryExport) => {
    setDeliveringId(item.id);
    try {
      await doctorApi.deliverHistoryExport(item.id);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo marcar la entrega');
    } finally {
      setDeliveringId(null);
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Copias de historia clínica"
        description="Pedidos de pacientes que atendiste. Tenés 48 horas desde el pedido para entregar la copia."
      />

      <div className="mb-4 flex gap-2" role="group" aria-label="Qué pedidos mostrar">
        {(['open', 'all'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? 'primary' : 'secondary'}
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
          >
            {value === 'open' ? 'En curso' : 'Todos'}
          </Button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title={scope === 'open' ? 'No tenés pedidos en curso' : 'Todavía no te asignaron ningún pedido'} />
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.patient.lastName}, {item.patient.firstName}
                  </p>
                  <p className="font-mono text-sm text-ink-soft tabular">DNI {item.patient.documentNumber}</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Pedido el {dateTime(item.requestedAt)}
                    {item.requesterType === 'REPRESENTANTE' &&
                      `, por ${item.requesterName} (${item.requesterRelationship}, documento ${item.requesterDocument})`}
                  </p>
                  {item.issuedAt && (
                    <p className="text-sm text-ink-soft">
                      Copia generada el {dateTime(item.issuedAt)}
                      {item.issueCount > 1 && ` (${item.issueCount} veces)`}
                      {item.consultationsCount !== null &&
                        `, ${item.consultationsCount} ${item.consultationsCount === 1 ? 'consulta' : 'consultas'}`}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="grid gap-1">
                    <HistoryExportStatusBadge item={item} />
                    <HistoryExportDue item={item} />
                  </div>
                  {(item.status === 'PENDIENTE' || item.status === 'EMITIDA') && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={item.status === 'PENDIENTE' ? 'primary' : 'secondary'} onClick={() => setIssuing(item)}>
                        {item.status === 'PENDIENTE' ? 'Generar copia' : 'Generar de nuevo'}
                      </Button>
                      {item.status === 'EMITIDA' && (
                        <Button size="sm" loading={deliveringId === item.id} onClick={() => deliver(item)}>
                          Marcar entregada
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {issuing && (
        <IssueModal
          item={issuing}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setIssuing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function IssueModal({
  item,
  onClose,
  onDone,
}: {
  item: HistoryExport;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const issue = async () => {
    setSaving(true);
    setError('');
    try {
      const blob = await doctorApi.issueHistoryExport(item.id);
      saveBlob(blob, `historia-clinica-${item.patient.lastName}-${item.patient.documentNumber}.pdf`.replace(/\s+/g, '-'));
      await showSuccess(
        'Copia generada',
        'Se descargó el PDF. Entregáselo al paciente y después marcá el pedido como entregado.',
      );
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
      onClose={onClose}
      title="Generar la copia de la historia clínica"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={issue} loading={saving} disabled={!confirmed}>
            Generar y descargar el PDF
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p>
          Vas a generar la copia de <strong>{item.patient.lastName}, {item.patient.firstName}</strong> (DNI{' '}
          {item.patient.documentNumber}).
        </p>
        <p className="text-ink-soft">
          Incluye todas las consultas finalizadas, de todos los profesionales, con diagnósticos, medicación, estudios,
          enmiendas y la huella de cada consulta. No incluye consultas sin finalizar.
        </p>
        <Notice>
          El PDF se descarga en esta computadora y no queda guardado en el servidor. Cada vez que lo generás queda
          registrado, sin el contenido.
        </Notice>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-eucalyptus"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            <span className="font-medium">
              Verifiqué la identidad de {item.requesterType === 'TITULAR' ? 'el paciente' : item.requesterName}
            </span>
            <span className="block text-sm text-ink-soft">
              {item.requesterType === 'TITULAR'
                ? 'Con su DNI, antes de entregarle la copia.'
                : `Es ${item.requesterRelationship} del paciente. Controlá su DNI y que esté autorizado a retirar la copia.`}
            </span>
          </span>
        </label>
        {error && <ErrorNotice message={error} />}
      </div>
    </Modal>
  );
}

export default DoctorHistoryExportsPage;
