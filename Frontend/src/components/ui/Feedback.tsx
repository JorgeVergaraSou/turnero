import type { ReactNode } from 'react';
import type { AppointmentStatus } from '@/interfaces';
import { STATUS_LABEL } from '@/utilities/clinic.utility';

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  RESERVADO: 'bg-st-reserved-wash text-st-reserved',
  CONFIRMADO: 'bg-st-confirmed-wash text-st-confirmed',
  EN_ATENCION: 'bg-st-attention-wash text-st-attention',
  ATENDIDO: 'bg-st-attended-wash text-st-attended',
  CANCELADO: 'bg-st-cancelled-wash text-st-cancelled',
  AUSENTE: 'bg-st-absent-wash text-st-absent',
};

/** Estado de turno: mismo color y texto en toda la app. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const label = STATUS_LABEL[status];
  const className = STATUS_CLASS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-ink-soft">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-line border-t-eucalyptus"
      />
      {label}
    </div>
  );
}

/** Estado vacío: dice qué pasa y qué se puede hacer. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-(--radius-panel) border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-ink-soft">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Error de carga con opción de reintentar. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-panel) border border-st-cancelled/30 bg-st-cancelled-wash px-4 py-3 text-st-cancelled"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Aviso informativo neutro. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-(--radius-panel) border border-st-reserved/20 bg-st-reserved-wash px-4 py-3 text-st-reserved">
      {children}
    </div>
  );
}

/** Encabezado de página del personal: título, contexto y acción principal. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Panel blanco sobre el papel. */
export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={`relative rounded-(--radius-panel) border border-line bg-sheet ${className}`}>
      {children}
    </Tag>
  );
}
