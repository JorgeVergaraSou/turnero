import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { doctorApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Consultation } from '@/interfaces';
import { Button, EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import { ConsultationRecord } from './ConsultationRecord';
import { dateTime } from '@/utilities';

/**
 * Historia clínica longitudinal: una entrada por consulta finalizada, más
 * reciente arriba. Cada entrada se abre para ver el registro completo.
 * `myProfessionalId` habilita enmendar las consultas propias.
 */
export function ClinicalHistory({
  patientId,
  myProfessionalId,
  excludeConsultationId,
  compact = false,
}: {
  patientId: number;
  myProfessionalId?: number;
  excludeConsultationId?: number;
  compact?: boolean;
}) {
  const [page, setPage] = useState(1);
  const history = useAsync(() => doctorApi.history(patientId, page, 10), [patientId, page]);
  const [openId, setOpenId] = useState<number | null>(null);

  if (history.loading && !history.data) return <Spinner label="Cargando historia clínica…" />;
  if (history.error) return <ErrorNotice message={history.error} onRetry={history.reload} />;

  const items = (history.data?.items ?? []).filter((c) => c.id !== excludeConsultationId);
  if (!items.length && page === 1)
    return <EmptyState title="Sin consultas anteriores">Esta es la primera atención registrada.</EmptyState>;

  const totalPages = history.data ? Math.ceil(history.data.total / history.data.limit) : 1;

  const replace = (updated: Consultation) =>
    history.setData(
      history.data && {
        ...history.data,
        items: history.data.items.map((c) => (c.id === updated.id ? updated : c)),
      },
    );

  return (
    <div>
      <ol className="grid gap-2">
        {items.map((c) => {
          const open = openId === c.id;
          const main = c.diagnoses.find((d) => d.type === 'PRINCIPAL') ?? c.diagnoses[0];
          return (
            <li key={c.id} className="rounded-(--radius-control) border border-line bg-sheet">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : c.id)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink-soft tabular">
                    {dateTime(c.startedAt)}, {c.professional.lastName}
                    {!compact && c.professional.specialties.length > 0 && ` (${c.professional.specialties.join(', ')})`}
                  </span>
                  <span className="block truncate font-medium">{main?.description ?? c.reason ?? 'Consulta'}</span>
                  {c.amendments.length > 0 && (
                    <span className="text-sm text-st-attention">Con enmiendas</span>
                  )}
                </span>
                <ChevronDownIcon
                  className={`mt-1 size-4 shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {open && (
                <div className="border-t border-line-soft px-4 py-4">
                  <ConsultationRecord
                    consultation={c}
                    canAmend={myProfessionalId === c.professional.id}
                    onAmended={replace}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Más recientes
          </Button>
          <span className="text-sm text-ink-soft tabular">
            {page} / {totalPages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Anteriores
          </Button>
        </div>
      )}
    </div>
  );
}
