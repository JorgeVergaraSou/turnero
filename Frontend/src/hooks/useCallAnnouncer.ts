import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayCall } from '@/interfaces';
import { CallAnnouncer, type VoiceStatus } from '@/utilities/callAnnouncer.utility';

/** Cuánto tiempo se muestra el aviso de "sin voz en español" tras activar el sonido. */
const WARNING_MS = 30_000;

/**
 * Sonido de la pantalla de sala (timbre + voz).
 *
 * El navegador exige un gesto del usuario para sonar, y ninguna página puede
 * saltearlo. Por eso el sonido se activa de tres formas, de la más cómoda a
 * la más manual:
 *  1. solo, al abrir la página, SI el navegador ya lo permite (modo quiosco de
 *     Chrome o sitio permitido en Firefox);
 *  2. con el primer clic, toque o tecla en cualquier parte de la página (sirve
 *     el control remoto del televisor);
 *  3. con el botón "Activar sonido".
 * Quien silencia a mano con "Sonido activo" no vuelve a activarse solo.
 * `announce` es estable: se le pasa directo al stream.
 */
export function useCallAnnouncer() {
  const [announcer] = useState(() => new CallAnnouncer());
  const [enabled, setEnabled] = useState(false);
  /** silenciado a mano: no se vuelve a activar solo ni con un clic suelto */
  const [userMuted, setUserMuted] = useState(false);
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

  // si el navegador bloquea la voz estando activo, vuelve el botón
  useEffect(() => {
    announcer.onBlocked(() => setEnabled(false));
    return () => announcer.onBlocked(null);
  }, [announcer]);

  /** `confirm` = false en la activación automática: la TV no habla sola al encenderse. */
  const activate = useCallback(
    (confirm = true) => {
      announcer.activate(confirm);
      setUserMuted(false);
      setEnabled(true);
      setVoiceStatus(announcer.voiceStatus());
      setWarningVisible(true);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setWarningVisible(false), WARNING_MS);
    },
    [announcer],
  );

  // 1) activación sola, solo si el navegador ya permite sonido sin gesto
  useEffect(() => {
    let cancelled = false;
    void announcer.probeAutoplay().then((allowed) => {
      if (allowed && !cancelled) activate(false);
    });
    return () => {
      cancelled = true;
    };
  }, [announcer, activate]);

  // 2) el primer clic, toque o tecla en cualquier parte activa el sonido
  useEffect(() => {
    if (enabled || userMuted) return;
    const onGesture = (event: Event) => {
      // el botón de sonido tiene su propio clic: si no, el gesto lo activaría y su clic lo silenciaría
      if ((event.target as Element | null)?.closest?.('[data-sound-control]')) return;
      activate(true);
    };
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach((name) => window.addEventListener(name, onGesture));
    return () => events.forEach((name) => window.removeEventListener(name, onGesture));
  }, [enabled, userMuted, activate]);

  const mute = useCallback(() => {
    announcer.deactivate();
    setUserMuted(true);
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
