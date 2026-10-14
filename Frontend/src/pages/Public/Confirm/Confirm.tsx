import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { AttendanceConfirmation } from '@/interfaces';
import { PublicRoutes } from '@/models';
import { Button, ErrorNotice, Notice, Spinner } from '@/components/ui';
import { getErrorMessage, longDate, shortTime } from '@/utilities';

/**
 * "Confirmo que voy": se llega desde el enlace del recordatorio. El enlace ya
 * identifica el turno (lleva una firma), así que acá no se pide nada más.
 * Solo sirve para avisar que se va a asistir; para cancelar hay que usar
 * "Mi turno" con el código y el DNI.
 */
export function ConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const info = useAsync(() => publicApi.attendanceInfo(token), [token]);
  const [done, setDone] = useState<AttendanceConfirmation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (info.loading) return <Spinner />;
  if (info.error || !info.data) {
    return (
      <div>
        <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Confirmar turno</h1>
        <div className="mt-6 max-w-prose">
          <ErrorNotice message={info.error || 'El enlace no es válido.'} />
          <p className="mt-4 text-ink-soft">
            Si necesitás ver o cancelar tu turno, entrá a{' '}
            <Link to={`/${PublicRoutes.MY_APPOINTMENT}`} className="font-medium text-eucalyptus underline underline-offset-2">
              Mi turno
            </Link>{' '}
            con tu código y tu DNI.
          </p>
        </div>
      </div>
    );
  }

  const appointment = done ?? info.data;

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      setDone(await publicApi.confirmAttendance(token));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-[2rem] font-bold sm:text-[2.5rem]">Confirmar turno</h1>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        Hola {appointment.firstName}. Tu turno es el <strong className="text-ink">{longDate(appointment.date)}</strong> a las{' '}
        <strong className="text-ink tabular">{shortTime(appointment.startTime)}</strong> en {appointment.officeName}.
      </p>

      <div className="mt-6 grid max-w-prose gap-4">
        {appointment.confirmed ? (
          <Notice>Listo, ya avisamos que vas a venir. ¡Te esperamos!</Notice>
        ) : appointment.canConfirm ? (
          <>
            <div>
              <Button size="lg" onClick={confirm} loading={saving}>
                Confirmo que voy
              </Button>
            </div>
            {error && <ErrorNotice message={error} />}
          </>
        ) : (
          <Notice>Este turno ya no se puede confirmar (se canceló, ya pasó o ya estás en el consultorio).</Notice>
        )}
        <p className="text-ink-soft">
          ¿No vas a poder venir? Cancelalo desde{' '}
          <Link to={`/${PublicRoutes.MY_APPOINTMENT}`} className="font-medium text-eucalyptus underline underline-offset-2">
            Mi turno
          </Link>{' '}
          con tu código y tu DNI, así el horario queda libre para otra persona.
        </p>
      </div>
    </div>
  );
}

export default ConfirmPage;
