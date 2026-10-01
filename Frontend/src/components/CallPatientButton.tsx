import { useEffect, useState } from 'react';
import { SpeakerWaveIcon } from '@heroicons/react/24/outline';
import { doctorApi } from '@/services';
import type { CallResult } from '@/interfaces';
import { Button } from '@/components/ui';
import { getErrorMessage } from '@/utilities';

/**
 * "Llamar / Volver a llamar" a un paciente en sala de espera. Confirma que
 * el llamado salió (consultorio y n.º de llamado) y respeta la pausa entre
 * llamados que exige el backend: el botón queda deshabilitado con una
 * cuenta regresiva en vez de dejar tocar y recibir un error.
 */
export function CallPatientButton({ appointmentId }: { appointmentId: number }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** instante (ms) en que se puede volver a llamar */
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (readyAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= readyAt) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [readyAt]);

  const secondsLeft = Math.max(0, Math.ceil((readyAt - now) / 1000));
  const noMoreCalls = result !== null && result.remainingCalls === 0;

  const call = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await doctorApi.call(appointmentId);
      setResult(response);
      const current = Date.now();
      setNow(current);
      setReadyAt(current + response.nextCallInSeconds * 1000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const label = noMoreCalls
    ? 'Sin más llamados'
    : secondsLeft > 0
      ? `Volver a llamar (${secondsLeft} s)`
      : result
        ? 'Volver a llamar'
        : 'Llamar';

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={result ? 'secondary' : 'primary'}
        loading={sending}
        disabled={secondsLeft > 0 || noMoreCalls}
        onClick={call}
      >
        <SpeakerWaveIcon aria-hidden className="mr-1.5 size-4" />
        {label}
      </Button>
      {/* aria-live: el lector de pantalla anuncia que el llamado salió o falló */}
      <span aria-live="polite" className="text-sm">
        {result && !error && (
          <span className="text-st-confirmed">
            Llamado n.º {result.callNumber} enviado · {result.officeName}
          </span>
        )}
        {error && <span className="text-st-cancelled">{error}</span>}
      </span>
    </span>
  );
}
