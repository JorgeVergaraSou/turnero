import { useEffect, useRef, useState } from 'react';
import type { DisplayCall, DisplayConfig } from '@/interfaces';
import { apiUrl } from '@/utilities';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'unauthorized';

/** Cuántos llamados guarda la pantalla (el actual + los anteriores). */
const MAX_CALLS = 5;
/** El servidor manda un latido cada 20 s: si pasa más que esto sin recibir nada, la conexión murió. */
const STALE_MS = 50_000;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;

interface SseBlock {
  event: string;
  data: unknown;
}

/** Parte el texto recibido en eventos SSE completos; devuelve lo que sobra. */
function parseBlocks(buffer: string): { blocks: SseBlock[]; rest: string } {
  const blocks: SseBlock[] = [];
  let rest = buffer.replace(/\r\n/g, '\n');
  let index: number;
  while ((index = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
    const raw = /^data: (.*)$/m.exec(block)?.[1];
    if (raw === undefined) continue;
    try {
      blocks.push({ event, data: JSON.parse(raw) });
    } catch {
      // un bloque dañado no debe tirar la pantalla: se ignora
    }
  }
  return { blocks, rest };
}

/**
 * Lee el stream de llamados del backend (SSE) con el token de la pantalla.
 *
 * Usa fetch y no EventSource porque el token va en la cabecera
 * `Authorization` (EventSource no puede mandar cabeceras). Reconecta solo,
 * con espera creciente, si se corta; y si el servidor no manda ni el latido
 * en 50 s, cierra y reintenta. Un 401 (token inválido, pantalla desactivada
 * o token rotado) NO reintenta: avisa para pedir un token nuevo.
 *
 * `onCall` se ejecuta una vez por cada llamado en vivo (para el sonido) y
 * `onConfig` cada vez que el servidor manda la configuración (al conectar y
 * cuando el administrador la cambia).
 *
 * Montar con `key={token}`: cambiar de token = componente nuevo = estado limpio.
 */
export function useDisplayStream(
  token: string,
  onCall?: (call: DisplayCall) => void,
  onConfig?: (config: DisplayConfig) => void,
) {
  // referencia al último callback: el stream no se reconecta si cambia
  const onCallRef = useRef(onCall);
  const onConfigRef = useRef(onConfig);
  useEffect(() => {
    onCallRef.current = onCall;
    onConfigRef.current = onConfig;
  }, [onCall, onConfig]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [calls, setCalls] = useState<DisplayCall[]>([]);
  /** key del último llamado que llegó EN VIVO (el del snapshot no destella) */
  const [freshKey, setFreshKey] = useState<string | null>(null);
  /** el sistema de llamados puede estar desactivado desde Configuración */
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    /** Una conexión. Devuelve true si hay que dejar de reintentar. */
    async function connectOnce(onConnected: () => void): Promise<boolean> {
      const current = new AbortController();
      controller = current;
      let lastActivity = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > STALE_MS) current.abort();
      }, 5_000);
      try {
        const response = await fetch(`${apiUrl}/display/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: current.signal,
        });
        if (response.status === 401) {
          setStatus('unauthorized');
          return true;
        }
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        setStatus('live');
        onConnected();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          lastActivity = Date.now();
          const parsed = parseBlocks(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const { event, data } of parsed.blocks) {
            if (event === 'config') {
              const config = data as DisplayConfig;
              setEnabled(config.enabled);
              onConfigRef.current?.(config);
            } else if (event === 'snapshot') {
              setCalls((data as { calls: DisplayCall[] }).calls.slice(0, MAX_CALLS));
            } else if (event === 'call') {
              const call = data as DisplayCall;
              setCalls((previous) =>
                [call, ...previous.filter((c) => c.key !== call.key)].slice(0, MAX_CALLS),
              );
              setFreshKey(call.key);
              // solo los llamados EN VIVO: el snapshot de la conexión nunca suena
              onCallRef.current?.(call);
            }
          }
        }
        return false;
      } finally {
        clearInterval(watchdog);
      }
    }

    async function run() {
      let attempt = 0;
      while (!stopped) {
        try {
          if (await connectOnce(() => (attempt = 0))) return;
        } catch {
          // corte de red, servidor caído o conexión sin latido: se reintenta
        }
        if (stopped) return;
        setStatus('reconnecting');
        attempt += 1;
        const backoff = Math.min(MIN_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
        await wait(backoff + Math.random() * 500);
      }
    }

    void run();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, [token]);

  return { status, calls, freshKey, enabled };
}
