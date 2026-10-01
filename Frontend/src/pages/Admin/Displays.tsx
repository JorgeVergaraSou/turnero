import { useState } from 'react';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { DisplayDevice, DisplayDeviceWithToken } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  PageHeader,
  Panel,
  Spinner,
  TextInput,
} from '@/components/ui';
import { copyToClipboard, dateTime, getErrorMessage, showError } from '@/utilities';
import { ActiveChip } from './Catalogs';

/** Enlace que carga el token en el televisor (el fragmento no viaja al servidor). */
const screenLink = (token: string) => `${window.location.origin}/pantalla#token=${token}`;

/**
 * Pantallas de la sala de espera (televisores). Cada una tiene un token
 * propio que solo sirve para leer el stream de llamados: no es un usuario.
 * El token se muestra una sola vez, al crearla o al cambiarlo.
 */
export function DisplaysPage() {
  const list = useAsync(() => adminApi.displayDevices(), []);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<DisplayDeviceWithToken | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const rotate = async (d: DisplayDevice) => {
    try {
      setIssued(await adminApi.rotateDisplayDeviceToken(d.id));
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Pantallas de sala"
        description="Los televisores de la sala de espera donde se muestra y se dice a quién se llama. Cada uno se conecta con su propio token."
        actions={<Button onClick={() => setCreating(true)}>Nueva pantalla</Button>}
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title="Todavía no hay pantallas"
          action={<Button onClick={() => setCreating(true)}>Crear la primera</Button>}
        >
          Creá una por cada televisor. Después abrí /pantalla en el televisor y cargá su token.
        </EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className={d.active ? '' : 'text-ink-faint'}>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-sm text-ink-soft">
                    {d.lastSeenAt ? `Última conexión: ${dateTime(d.lastSeenAt)}` : 'Nunca se conectó'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActiveChip active={d.active} />
                  <Button size="sm" variant="secondary" onClick={() => rotate(d)}>
                    Cambiar token
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => run(() => adminApi.updateDisplayDevice(d.id, { active: !d.active }))}
                  >
                    {d.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(device) => {
            setCreating(false);
            setIssued(device);
            list.reload();
          }}
        />
      )}
      {issued && <TokenModal device={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (device: DisplayDeviceWithToken) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onCreated(await adminApi.createDisplayDevice(name));
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva pantalla"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="display-form" loading={saving}>
            Crear pantalla
          </Button>
        </>
      }
    >
      <form id="display-form" onSubmit={save} className="grid gap-4">
        <TextInput
          label="Nombre"
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Para reconocerla: por ejemplo «TV sala de espera» o «TV planta alta»."
        />
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}

/** El token se ve una sola vez: hay que copiarlo (o el enlace) antes de cerrar. */
function TokenModal({ device, onClose }: { device: DisplayDeviceWithToken; onClose: () => void }) {
  const [copied, setCopied] = useState<'token' | 'link' | null>(null);
  const copy = async (what: 'token' | 'link') => {
    if (await copyToClipboard(what === 'token' ? device.token : screenLink(device.token))) setCopied(what);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Token de «${device.name}»`}
      footer={<Button onClick={onClose}>Ya lo copié</Button>}
    >
      <div className="grid gap-4">
        <p className="rounded-(--radius-control) bg-st-attention-wash px-4 py-3 font-medium text-st-attention">
          Copialo ahora: por seguridad no se vuelve a mostrar. Si lo perdés, se cambia por uno nuevo.
        </p>
        <div>
          <p className="mb-1 font-medium">Token</p>
          <p className="rounded-(--radius-control) border border-line bg-paper px-3 py-2.5 font-mono text-sm break-all select-all">
            {device.token}
          </p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => copy('token')}>
            {copied === 'token' ? 'Token copiado' : 'Copiar token'}
          </Button>
        </div>
        <div>
          <p className="mb-1 font-medium">Enlace para abrir en el televisor</p>
          <p className="rounded-(--radius-control) border border-line bg-paper px-3 py-2.5 font-mono text-sm break-all select-all">
            {screenLink(device.token)}
          </p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => copy('link')}>
            {copied === 'link' ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
          <p className="mt-2 text-sm text-ink-soft">
            Abrirlo en el televisor carga el token solo, sin tener que escribirlo. Después hay que tocar «Activar
            sonido» una vez.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default DisplaysPage;
