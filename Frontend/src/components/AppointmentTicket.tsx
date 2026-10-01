import { useEffect, useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import type { PublicAppointment } from '@/interfaces';
import { StatusBadge } from '@/components/ui';
import { copyToClipboard, formatCode, longDate, shortTime } from '@/utilities';

/**
 * Comprobante del turno: el talón que antes daba la recepción, ahora en
 * pantalla. Arriba lo que el paciente necesita para ir (cuándo, con quién,
 * dónde); abajo del troquel, el código para consultar o cancelar.
 */
export function AppointmentTicket({
  appointment,
  animate = false,
}: {
  appointment: PublicAppointment;
  animate?: boolean;
}) {
  const cancelled = appointment.status === 'CANCELADO';
  return (
    <article
      className={`ticket relative mx-auto w-full max-w-md ${animate ? 'ticket-enter' : ''}`}
      style={{ ['--stub' as string]: 'calc(100% - 7.5rem)' }}
      aria-label="Comprobante de turno"
    >
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-ink-soft">{appointment.patientName}</p>
          <StatusBadge status={appointment.status} />
        </div>

        <p
          className={`mt-4 text-[2.75rem] leading-none font-bold tabular ${cancelled ? 'text-ink-faint line-through' : ''}`}
        >
          {shortTime(appointment.startTime)}
        </p>
        <p className="mt-2 text-lg font-medium first-letter:uppercase">
          {longDate(appointment.date)}
        </p>

        <dl className="mt-5 grid gap-3 text-[0.95rem]">
          <div>
            <dt className="text-sm text-ink-soft">Profesional</dt>
            <dd className="font-medium">
              {appointment.professional.firstName} {appointment.professional.lastName}
              <span className="block font-normal text-ink-soft">{appointment.specialty}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Dónde</dt>
            <dd className="font-medium">
              {appointment.office.name}, {appointment.office.address}
              {appointment.office.locationDetails && (
                <span className="block font-normal text-ink-soft">
                  {appointment.office.locationDetails}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="ticket-perforation mx-4" aria-hidden />

      <div className="flex h-[7.5rem] flex-col justify-center px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">Código del turno</p>
          <CopyCodeButton code={appointment.code} />
        </div>
        {/* un clic selecciona el código entero (select-all) */}
        <p className="mt-1 font-mono text-[1.9rem] font-semibold tracking-[0.12em] tabular select-all">
          {formatCode(appointment.code)}
        </p>
      </div>
    </article>
  );
}

/**
 * Copia el código SIN el espacio de agrupado (lo que se pega en "Mi turno"
 * o en un mensaje tiene que ser el código tal cual). Confirma con
 * "Copiado" unos segundos.
 */
function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(id);
  }, [state]);

  const copy = async () => setState((await copyToClipboard(code)) ? 'copied' : 'failed');

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-(--radius-control) border border-line px-2.5 py-1 text-sm font-medium text-eucalyptus hover:border-eucalyptus print:hidden"
    >
      {state === 'copied' ? (
        <CheckIcon className="size-4" aria-hidden />
      ) : (
        <ClipboardDocumentIcon className="size-4" aria-hidden />
      )}
      <span aria-live="polite">
        {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Seleccioná y copiá' : 'Copiar código'}
      </span>
    </button>
  );
}
