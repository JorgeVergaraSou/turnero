import { publicApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Slot } from '@/interfaces';
import { EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import { shortTime } from '@/utilities';

/**
 * Grilla de horarios libres de un profesional para UN día (recepción:
 * dar turno y reprogramar). Usa la misma disponibilidad que la reserva
 * pública, así recepción y pacientes ven exactamente lo mismo.
 */
export function SlotPicker({
  professionalId,
  date,
  selected,
  onSelect,
}: {
  professionalId: number;
  date: string;
  selected: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const { data, loading, error, reload } = useAsync(
    () => publicApi.availability(professionalId, date, date),
    [professionalId, date],
  );

  if (loading) return <Spinner label="Buscando horarios libres…" />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!data?.length)
    return <EmptyState title="Sin horarios libres ese día">Probá con otra fecha.</EmptyState>;

  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label="Horarios libres">
      {data.map((slot) => {
        const isSelected = selected === slot.startTime;
        return (
          <li key={slot.startTime}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(slot)}
              className={`h-10 w-full rounded-(--radius-control) border font-medium tabular ${isSelected ? 'border-eucalyptus bg-eucalyptus text-white' : 'border-line bg-sheet hover:border-eucalyptus'}`}
            >
              {shortTime(slot.startTime)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
