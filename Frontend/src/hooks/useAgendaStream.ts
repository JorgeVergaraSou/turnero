import { useEffect, useRef } from 'react';
import { UserKey } from '@/redux/states/user';
import { apiUrl } from '@/utilities';

/** El servidor manda un latido cada 20 s: si pasa más que esto sin recibir nada, la conexión murió. */
const STALE_MS = 50_000;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;
/** Varios cambios seguidos (ej. un turno que cambia dos veces) se juntan en un solo refresco. */
const DEBOUNCE_MS = 300;

/** Parte el texto recibido en eventos SSE completos; devuelve lo que sobra. */
function parseBlocks(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  let rest = buffer.replace(/\r\n/g, '\n');
  let index: number;
  while ((index = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    events.push(/^event: (.*)$/m.exec(block)?.[1] ?? 'message');
  }
  return { events, rest };
}

function sessionToken(): string | null {
  try {
    const stored = localStorage.getItem(UserKey);
    return stored ? (JSON.parse(stored).token ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Escucha los avisos de cambios en la agenda (Server-Sent Events) y llama a
 * `onChange` cuando algo cambió — por ejemplo, recepción marcó que llegó un
 * paciente — para que la pantalla vuelva a pedir sus datos. El aviso no trae
 * datos: la pantalla recarga con su propia sesión.
 *
 * Usa fetch y no EventSource porque el token va en la cabecera
 * `Authorization`. Reconecta solo, con espera creciente; si el servidor no
 * manda ni el latido en 50 s, cierra y reintenta. Al RECONECTAR también
 * llama a `onChange` (puede haberse perdido algún aviso mientras estuvo
 * cortado). Un 401/403 no reintenta: el interceptor de sesión se encarga.
 *
 * `path`: '/doctor/agenda/stream' (médico) o '/admin/agenda/stream' (recepción).
 */
export function useAgendaStream(path: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const notify = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
    };

    /** Una conexión. Devuelve true si hay que dejar de reintentar. */
    async function connectOnce(isReconnect: boolean, onConnected: () => void): Promise<boolean> {
      const token = sessionToken();
      if (!token) return true;
      const current = new AbortController();
      controller = current;
      let lastActivity = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > STALE_MS) current.abort();
      }, 5_000);
      try {
        const response = await fetch(`${apiUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: current.signal,
        });
        if (response.status === 401 || response.status === 403) return true;
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        onConnected();
        // lo que haya pasado mientras estuvo cortado
        if (isReconnect) notify();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          lastActivity = Date.now();
          const parsed = parseBlocks(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          if (parsed.events.includes('change')) notify();
        }
        return false;
      } finally {
        clearInterval(watchdog);
      }
    }

    async function run() {
      let attempt = 0;
      let connectedBefore = false;
      while (!stopped) {
        try {
          const stop = await connectOnce(connectedBefore, () => {
            attempt = 0;
            connectedBefore = true;
          });
          if (stop) return;
        } catch {
          // corte de red, servidor caído o conexión sin latido: se reintenta
        }
        if (stopped) return;
        attempt += 1;
        await wait(Math.min(MIN_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS) + Math.random() * 500);
      }
    }

    void run();
    return () => {
      stopped = true;
      clearTimeout(debounce);
      controller?.abort();
    };
  }, [path]);
}
