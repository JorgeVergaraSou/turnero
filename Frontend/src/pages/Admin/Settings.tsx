import { useState } from 'react';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { notifyClinicSettingsChanged } from '@/hooks/useClinicSettings';
import type { AdminClinicSettings, CallNameFormat } from '@/interfaces';
import {
  Button,
  ErrorNotice,
  Notice,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { getErrorMessage } from '@/utilities';

/** Configuración administrativa del consultorio (solo ADMIN). */
export function SettingsPage() {
  const current = useAsync(() => adminApi.settings(), []);
  if (current.loading) return <Spinner />;
  if (current.error || !current.data)
    return <ErrorNotice message={current.error} onRetry={current.reload} />;
  return <SettingsForm initial={current.data} />;
}

function SettingsForm({ initial }: { initial: AdminClinicSettings }) {
  const [form, setForm] = useState({
    clinicName: initial.clinicName,
    contactPhone: initial.contactPhone ?? '',
    publicBookingEnabled: initial.publicBookingEnabled,
    bookingHorizonDays: String(initial.bookingHorizonDays),
    publicCancelMinHours: String(initial.publicCancelMinHours),
    reminderHoursBefore: String(initial.reminderHoursBefore),
    publicMaxPendingPerPatient: String(initial.publicMaxPendingPerPatient),
    callsEnabled: initial.callsEnabled,
    callNameFormat: initial.callNameFormat as string,
    callVoiceRepeats: String(initial.callVoiceRepeats),
  });
  const [twoFactorRoles, setTwoFactorRoles] = useState(initial.twoFactorRoles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSaved(false);
      setForm({
        ...form,
        [field]:
          e.target instanceof HTMLInputElement && e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.value,
      });
    };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.updateSettings({
        clinicName: form.clinicName,
        contactPhone: form.contactPhone.trim() || null,
        publicBookingEnabled: form.publicBookingEnabled,
        bookingHorizonDays: Number(form.bookingHorizonDays),
        publicCancelMinHours: Number(form.publicCancelMinHours),
        reminderHoursBefore: Number(form.reminderHoursBefore),
        publicMaxPendingPerPatient: Number(form.publicMaxPendingPerPatient),
        callsEnabled: form.callsEnabled,
        callNameFormat: form.callNameFormat as CallNameFormat,
        callVoiceRepeats: Number(form.callVoiceRepeats),
        twoFactorRoles,
      });
      notifyClinicSettingsChanged();
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Configuración"
        description="Cómo ven el consultorio los pacientes y qué pueden hacer por su cuenta."
      />
      <form onSubmit={save} className="grid gap-5">
        <Panel className="grid gap-4 p-6">
          <h2 className="text-lg font-bold">Datos del consultorio</h2>
          <TextInput
            label="Nombre"
            required
            value={form.clinicName}
            onChange={set('clinicName')}
            hint="Aparece en la reserva, en el comprobante del turno y en los mails."
          />
          <TextInput
            label="Teléfono de contacto"
            type="tel"
            value={form.contactPhone}
            onChange={set('contactPhone')}
            hint="Se le muestra al paciente cuando algo no se puede resolver online."
          />
        </Panel>

        <Panel className="grid gap-4 p-6">
          <h2 className="text-lg font-bold">Turnos online</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-eucalyptus"
              checked={form.publicBookingEnabled}
              onChange={set('publicBookingEnabled')}
            />
            <span>
              <span className="font-medium">Los pacientes pueden pedir turno por la web</span>
              <span className="block text-sm text-ink-soft">
                Si lo desactivás, solo recepción da turnos. Los pacientes igual pueden consultar
                los que ya tienen.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Días hacia adelante para reservar"
              type="number"
              min={1}
              max={365}
              required
              value={form.bookingHorizonDays}
              onChange={set('bookingHorizonDays')}
              hint="También limita a recepción."
            />
            <TextInput
              label="Anticipación para cancelar online (horas)"
              type="number"
              min={0}
              max={168}
              required
              value={form.publicCancelMinHours}
              onChange={set('publicCancelMinHours')}
              hint="0 = hasta que empiece el turno. Recepción siempre puede cancelar."
            />
            <TextInput
              label="Turnos pendientes por paciente (web)"
              type="number"
              min={0}
              max={20}
              required
              value={form.publicMaxPendingPerPatient}
              onChange={set('publicMaxPendingPerPatient')}
              hint="Cuántos turnos futuros puede tener un mismo DNI reservando por la web. Limita a quien reserve con un DNI ajeno. 0 = sin tope. Recepción no tiene este límite."
            />
          </div>
        </Panel>

        <Panel className="grid gap-3 p-6">
          <h2 className="text-lg font-bold">Verificación en dos pasos</h2>
          <p className="text-sm text-ink-soft">
            Además de la contraseña, se pide un código de 6 dígitos de una app del celular (Google o Microsoft
            Authenticator). Quien la tenga que usar la configura en su próximo ingreso, escaneando un código QR.
            Recomendado para quienes ven historias clínicas o administran el sistema.
          </p>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-medium">Exigirla a:</legend>
            {(
              [
                ['ADMIN', 'Administración'],
                ['MEDICO', 'Médicos'],
                ['RECEPCIONISTA', 'Recepción'],
              ] as const
            ).map(([role, label]) => (
              <label key={role} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 accent-eucalyptus"
                  checked={twoFactorRoles.includes(role)}
                  onChange={(e) => {
                    setSaved(false);
                    setTwoFactorRoles(
                      e.target.checked
                        ? [...twoFactorRoles, role]
                        : twoFactorRoles.filter((r) => r !== role),
                    );
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-ink-soft">
            Si alguien pierde el celular y no tiene sus códigos de recuperación, reiniciásela desde Usuarios.
          </p>
        </Panel>

        <Panel className="grid gap-4 p-6">
          <h2 className="text-lg font-bold">Recordatorios</h2>
          <TextInput
            label="Mandar el recordatorio (horas antes del turno)"
            type="number"
            min={0}
            max={72}
            required
            value={form.reminderHoursBefore}
            onChange={set('reminderHoursBefore')}
            wrapperClassName="sm:max-w-xs"
            hint="0 = no se mandan. Llega por mail a los pacientes que dejaron email. A quien reserva dentro de ese plazo no se le manda: ya recibió la confirmación."
          />
        </Panel>

        <Panel className="grid gap-4 p-6">
          <h2 className="text-lg font-bold">Llamado de pacientes</h2>
          <p className="text-sm text-ink-soft">
            El médico llama al paciente desde su panel y la pantalla de la sala de espera muestra y dice su nombre y el
            consultorio. Los cambios llegan solos a las pantallas conectadas. Las pantallas se crean en{' '}
            <span className="font-medium">Pantallas de sala</span>.
          </p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-eucalyptus"
              checked={form.callsEnabled}
              onChange={set('callsEnabled')}
            />
            <span>
              <span className="font-medium">El llamado de pacientes está activado</span>
              <span className="block text-sm text-ink-soft">
                Si lo desactivás, los médicos no ven el botón Llamar y las pantallas dejan de mostrar nombres.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Cómo se nombra al paciente"
              value={form.callNameFormat}
              onChange={set('callNameFormat')}
              hint={
                form.callNameFormat === 'CODE'
                  ? 'La pantalla no muestra ningún nombre: el paciente tiene que conocer su código (lo ve en el comprobante del turno). Es lo más privado.'
                  : form.callNameFormat === 'ABBREVIATED'
                    ? 'El apellido completo no sale de la base de datos hacia la pantalla.'
                    : 'Lo más claro para el paciente, pero cualquiera en la sala ve el nombre completo.'
              }
            >
              <option value="FULL">Nombre y apellido (Juan Pérez)</option>
              <option value="ABBREVIATED">Nombre e inicial del apellido (Juan P.)</option>
              <option value="CODE">Solo el código del turno (K7M2Q 9XW4P)</option>
            </SelectInput>
            <SelectInput
              label="Veces que se repite la voz"
              value={form.callVoiceRepeats}
              onChange={set('callVoiceRepeats')}
              hint="Cada llamado suena con un timbre y después la voz."
            >
              <option value="1">1 vez</option>
              <option value="2">2 veces</option>
              <option value="3">3 veces</option>
            </SelectInput>
          </div>
        </Panel>

        {error && <ErrorNotice message={error} />}
        {saved && <Notice>Configuración guardada.</Notice>}
        <div>
          <Button type="submit" loading={saving}>
            Guardar configuración
          </Button>
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
