import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import type { HistoryExport, HistoryExportStatus, HistoryExportSummary } from '@/interfaces';
import { dateTime, durationText } from '@/utilities';

/** Cada cuánto se actualiza solo el aviso del inicio (la pantalla queda abierta todo el día). */
const REFRESH_MS = 60_000;

const STATUS_LABEL: Record<HistoryExportStatus, string> = {
  PENDIENTE: 'Pendiente',
  EMITIDA: 'Copia generada',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
};

const STATUS_CLASS: Record<HistoryExportStatus, string> = {
  PENDIENTE: 'bg-st-reserved-wash text-st-reserved',
  EMITIDA: 'bg-st-attention-wash text-st-attention',
  ENTREGADA: 'bg-st-attended-wash text-st-attended',
  CANCELADA: 'bg-st-absent-wash text-st-absent',
};

/** Estado del pedido; si el plazo de 48 h está vencido lo dice aparte, en rojo. */
export function HistoryExportStatusBadge({ item }: { item: HistoryExport }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${STATUS_CLASS[item.status]}`}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {STATUS_LABEL[item.status]}
      </span>
      {item.overdue && (
        <span className="inline-flex rounded-full bg-st-cancelled-wash px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-st-cancelled">
          Vencido
        </span>
      )}
    </span>
  );
}

/** Cuánto falta (o cuánto se pasó) del plazo de 48 h, o cómo terminó el pedido. */
export function HistoryExportDue({ item }: { item: HistoryExport }) {
  if (item.minutesLeft === null) {
    if (item.deliveredAt) return <span className="text-ink-soft">Entregada el {dateTime(item.deliveredAt)}</span>;
    if (item.cancelledAt) return <span className="text-ink-soft">Cancelada el {dateTime(item.cancelledAt)}</span>;
    return null;
  }
  const soon = item.minutesLeft >= 0 && item.minutesLeft < 6 * 60;
  return (
    <span className={item.overdue ? 'font-medium text-st-cancelled' : soon ? 'font-medium text-st-attention' : 'text-ink-soft'}>
      {item.overdue ? `Se venció hace ${durationText(item.minutesLeft)}` : `Vence en ${durationText(item.minutesLeft)}`}
      <span className="block text-sm font-normal text-ink-faint">{dateTime(item.dueAt)}</span>
    </span>
  );
}

/**
 * Aviso del inicio: cuántos pedidos de copia siguen en curso y cuál vence
 * primero. No aparece si no hay ninguno. Se actualiza solo.
 */
export function HistoryExportsNotice({
  load,
  to,
  singular,
  plural,
}: {
  load: () => Promise<HistoryExportSummary>;
  to: string;
  singular: string;
  plural: string;
}) {
  const summary = useAsync(load, []);
  const reloadRef = useRef(summary.reload);
  useLayoutEffect(() => {
    reloadRef.current = summary.reload;
  });
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const data = summary.data;
  if (!data || data.open === 0) return null;

  const minutesToNext = data.nextMinutesLeft;
  const alert = data.overdue > 0;

  return (
    <Link
      to={to}
      className={`mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-(--radius-panel) border px-4 py-3 ${
        alert
          ? 'border-st-cancelled/40 bg-st-cancelled-wash text-st-cancelled'
          : 'border-line bg-sheet text-ink hover:border-ink-soft'
      }`}
    >
      <span className="font-medium">
        {data.open} {data.open === 1 ? singular : plural}
        {alert && `, ${data.overdue} ${data.overdue === 1 ? 'vencido' : 'vencidos'}`}
      </span>
      <span className={`text-sm ${alert ? '' : 'text-ink-soft'}`}>
        {minutesToNext === null
          ? ''
          : minutesToNext < 0
            ? `El más atrasado se venció hace ${durationText(minutesToNext)}`
            : `El próximo vence en ${durationText(minutesToNext)}`}
        <span className="ml-3 underline underline-offset-2">Ver</span>
      </span>
    </Link>
  );
}
