import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { receptionApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useAgendaStream } from '@/hooks/useAgendaStream';
import type { WhatsAppReminder } from '@/interfaces';
import { Button, Panel } from '@/components/ui';
import { clinicToday, getErrorMessage, numericDate, shortTime, showError } from '@/utilities';

/** Cada cuánto se actualiza solo la lista (la pantalla de recepción queda abierta todo el día). */
const REFRESH_MS = 60_000;

const STAGE_LABEL: Record<WhatsAppReminder['stage'], string> = {
  1: 'Aviso previo',
  2: 'Último aviso',
};

/**
 * Avisos por WhatsApp que le toca hacer a recepción. No se manda nada solo: el
 * botón abre el chat (wa.me) con el mensaje ya escrito, y el aviso queda
 * marcado como enviado para que no vuelva a aparecer. Usa las mismas ventanas
 * que los recordatorios por mail (se configuran en Configuración). No aparece
 * si no hay nada pendiente. El mensaje lleva solo día, hora y consultorio.
 */
export function WhatsAppReminders() {
  const list = useAsync(() => receptionApi.whatsappReminders(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const reloadRef = useRef(list.reload);
  useLayoutEffect(() => {
    reloadRef.current = list.reload;
  });
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  useAgendaStream('/admin/agenda/stream', list.reload);

  const items = list.data ?? [];
  if (items.length === 0) return null;
  const today = clinicToday();

  const mark = async (item: WhatsAppReminder, outcome: 'SENT' | 'SKIPPED') => {
    const key = `${item.appointmentId}-${item.stage}`;
    setBusy(key);
    try {
      await receptionApi.markWhatsappReminder(item.appointmentId, item.stage, outcome);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err), 'No se pudo registrar el aviso');
    } finally {
      setBusy(null);
    }
  };

  const open = (item: WhatsAppReminder) => {
    // se abre primero (el navegador solo lo permite dentro del clic) y después se marca
    if (item.whatsappUrl) window.open(item.whatsappUrl, '_blank', 'noopener,noreferrer');
    void mark(item, 'SENT');
  };

  return (
    <Panel className="mb-6">
      <div className="border-b border-line-soft px-5 py-3">
        <h2 className="text-lg font-bold">
          Avisos por WhatsApp <span className="font-normal text-ink-soft tabular">({items.length})</span>
        </h2>
        <p className="text-sm text-ink-soft">
          Abrí el chat con el mensaje ya escrito y mandalo. El aviso se marca solo y deja de aparecer.
        </p>
      </div>
      <ul className="divide-y divide-line-soft">
        {items.map((item) => {
          const key = `${item.appointmentId}-${item.stage}`;
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <span className="w-24 shrink-0 tabular">
                <span className="font-mono text-lg font-semibold">{shortTime(item.startTime)}</span>
                {item.date !== today && <span className="block text-sm text-ink-soft">{numericDate(item.date)}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {item.lastName}, {item.firstName}
                </span>
                <span className="block text-sm text-ink-soft">
                  <span className="font-medium text-ink">{STAGE_LABEL[item.stage]}</span>
                  {' · '}
                  <span className="tabular">{item.phone}</span>
                </span>
                {!item.whatsappUrl && (
                  <span className="block text-sm text-st-attention">
                    Ese teléfono no sirve para WhatsApp (falta el código de área o no es un celular). Llamalo o corregí
                    el dato en Pacientes.
                  </span>
                )}
                <details className="mt-1 text-sm text-ink-soft">
                  <summary className="cursor-pointer">Ver el mensaje</summary>
                  <p className="mt-1 max-w-prose whitespace-pre-line rounded-(--radius-control) bg-paper px-3 py-2">
                    {item.message}
                  </p>
                </details>
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {item.whatsappUrl ? (
                  <Button size="sm" loading={busy === key} onClick={() => open(item)}>
                    Abrir WhatsApp
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={busy === key} onClick={() => mark(item, 'SENT')}>
                    Ya lo avisé
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy === key} onClick={() => mark(item, 'SKIPPED')}>
                  No avisar
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
