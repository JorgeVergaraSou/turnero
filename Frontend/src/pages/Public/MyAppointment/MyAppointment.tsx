import { useState } from 'react';
import Swal from 'sweetalert2';
import { publicApi } from '@/services';
import type { PublicAppointment } from '@/interfaces';
import { Button, ErrorNotice, Notice, TextInput } from '@/components/ui';
import { AppointmentTicket } from '@/components/AppointmentTicket';
import { getErrorMessage, hasStarted, longDate, minutesUntil, shortTime } from '@/utilities';
import { useClinicSettings } from '@/hooks/useClinicSettings';

/**
 * Consultar / cancelar un turno sin cuenta: código + DNI. El DNI viaja en
 * el cuerpo (POST), nunca en la URL.
 */
export function MyAppointmentPage() {
  const [code, setCode] = useState('');
  const [dni, setDni] = useState('');
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { settings } = useClinicSettings();

  const credentials = () => ({
    code: code.replace(/[\s-]/g, '').toUpperCase(),
    documentNumber: dni.replace(/[.\s-]/g, ''),
  });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const { code: c, documentNumber } = credentials();
    if (c.length !== 10 || documentNumber.length < 5) {
      setError('Ingresá el código de 10 caracteres y tu DNI.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setAppointment(await publicApi.lookup(c, documentNumber));
    } catch (err) {
      setAppointment(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!appointment) return;
    const { isConfirmed } = await Swal.fire({
      icon: 'warning',
      title: 'Cancelar el turno',
      text: `Vas a cancelar el turno del ${longDate(appointment.date)} a las ${shortTime(appointment.startTime)}. El horario queda libre para otra persona.`,
      showCancelButton: true,
      confirmButtonText: 'Cancelar turno',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    try {
      const { code: c, documentNumber } = credentials();
      setAppointment(await publicApi.cancel(c, documentNumber));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const pending =
    appointment &&
    ['RESERVADO', 'CONFIRMADO'].includes(appointment.status) &&
    !hasStarted(appointment.date, appointment.startTime);
  const minHours = settings?.publicCancelMinHours ?? 0;
  // dentro de la anticipación mínima configurada ya no se cancela online
  const tooLate =
    pending && minutesUntil(appointment.date, appointment.startTime) < minHours * 60;
  const cancellable = pending && !tooLate;

  return (
    <div>
      <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Mi turno</h1>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        Con el código que te dimos al reservar y tu DNI podés ver el turno o cancelarlo.
      </p>

      <form onSubmit={lookup} noValidate className="mt-8 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextInput
          label="Código del turno"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-widest uppercase tabular"
          placeholder="XXXXX XXXXX"
        />
        <TextInput
          label="DNI"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          inputMode="numeric"
          className="font-mono tabular"
        />
        <Button type="submit" size="lg" loading={loading} className="h-11">
          Buscar
        </Button>
      </form>

      {error && (
        <div className="mt-4">
          <ErrorNotice message={error} />
        </div>
      )}

      {appointment && (
        <div className="mt-10">
          <AppointmentTicket appointment={appointment} />
          <div className="mx-auto mt-6 max-w-md">
            {cancellable ? (
              <Button variant="danger" className="w-full" onClick={cancel}>
                Cancelar este turno
              </Button>
            ) : tooLate ? (
              <Notice>
                Online se puede cancelar hasta {minHours} h antes del turno. Para cancelarlo ahora,{' '}
                {settings?.contactPhone ? (
                  <>
                    llamá al{' '}
                    <a href={`tel:${settings.contactPhone}`} className="font-medium underline underline-offset-2">
                      {settings.contactPhone}
                    </a>
                    .
                  </>
                ) : (
                  'comunicate con el consultorio.'
                )}
              </Notice>
            ) : appointment.status === 'CANCELADO' ? (
              <Notice>Este turno está cancelado. Si lo necesitás, podés pedir uno nuevo.</Notice>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default MyAppointmentPage;
