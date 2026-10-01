import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayCall } from '@/interfaces';
import { CallAnnouncer, type VoiceStatus } from '@/utilities/callAnnouncer.utility';

/** Cuánto tiempo se muestra el aviso de "sin voz en español" tras activar el sonido. */
const WARNING_MS = 30_000;

/**
 * Sonido de la pantalla de sala (timbre + voz). Arranca silenciado: el
 * navegador exige un gesto del usuario, así que el sonido se activa con el
 * botón "Activar sonido" (`activate`). `announce` es estable: se le pasa
 * directo al stream.
 */
export function useCallAnnouncer() {
  const [announcer] = useState(() => new CallAnnouncer());
  const [enabled, setEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(() => announcer.voiceStatus());
  const [warningVisible, setWarningVisible] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chrome carga las voces de forma asíncrona: avisa con `voiceschanged`
  useEffect(() => {
    if (!announcer.speechSupported) return;
    const refresh = () => setVoiceStatus(announcer.voiceStatus());
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, [announcer]);

  useEffect(
    () => () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
      announcer.deactivate();
    },
    [announcer],
  );

  const activate = useCallback(() => {
    announcer.activate();
    setEnabled(true);
    setVoiceStatus(announcer.voiceStatus());
    setWarningVisible(true);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarningVisible(false), WARNING_MS);
  }, [announcer]);

  const mute = useCallback(() => {
    announcer.deactivate();
    setEnabled(false);
    setWarningVisible(false);
  }, [announcer]);

  const setRepeats = useCallback((repeats: number) => announcer.setRepeats(repeats), [announcer]);

  const announce = useCallback((call: DisplayCall) => announcer.enqueue(call), [announcer]);

  return {
    enabled,
    activate,
    mute,
    announce,
    setRepeats,
    voiceStatus,
    /** el aviso es para quien instala la pantalla: se oculta solo a los 30 s */
    showVoiceWarning: warningVisible && voiceStatus !== 'spanish',
  };
}
