import { useState } from 'react';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { HealthInsurance, Office, Specialty } from '@/interfaces';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  PageHeader,
  Panel,
  Spinner,
  TextArea,
  TextInput,
} from '@/components/ui';
import { getErrorMessage, showError } from '@/utilities';

/** Chip activo/inactivo de los catálogos (no se borra nada: se desactiva). */
export function ActiveChip({ active, masculine = false }: { active: boolean; masculine?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${active ? 'bg-st-confirmed-wash text-st-confirmed' : 'bg-st-absent-wash text-st-absent'}`}
    >
      {active ? (masculine ? 'Activo' : 'Activa') : masculine ? 'Inactivo' : 'Inactiva'}
    </span>
  );
}

// ------------------------------------------------------------------
// Especialidades
// ------------------------------------------------------------------

export function SpecialtiesPage() {
  const list = useAsync(() => adminApi.specialties(), []);
  const [editing, setEditing] = useState<Specialty | 'new' | null>(null);

  const toggle = async (s: Specialty) => {
    try {
      await adminApi.updateSpecialty(s.id, { active: !s.active });
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Especialidades"
        description="Las inactivas dejan de ofrecerse para reservar; los turnos y consultas anteriores las conservan."
        actions={<Button onClick={() => setEditing('new')}>Nueva especialidad</Button>}
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title="Todavía no hay especialidades"
          action={<Button onClick={() => setEditing('new')}>Crear la primera</Button>}
        >
          Son lo primero que elige un paciente al pedir turno.
        </EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className={s.active ? '' : 'text-ink-faint'}>
                  <p className="font-medium">{s.name}</p>
                  {s.description && <p className="text-sm text-ink-soft">{s.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <ActiveChip active={!!s.active} />
                  <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(s)}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {editing && (
        <SpecialtyModal
          specialty={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function SpecialtyModal({
  specialty,
  onClose,
  onSaved,
}: {
  specialty: Specialty | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(specialty?.name ?? '');
  const [description, setDescription] = useState(specialty?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = { name, ...(description.trim() && { description: description.trim() }) };
    try {
      if (specialty) await adminApi.updateSpecialty(specialty.id, body);
      else await adminApi.createSpecialty(body);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={specialty ? 'Editar especialidad' : 'Nueva especialidad'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="specialty-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="specialty-form" onSubmit={save} className="grid gap-4">
        <TextInput label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextArea
          label="Descripción (opcional)"
          hint="La ve el paciente al elegir especialidad."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Obras sociales
// ------------------------------------------------------------------

export function HealthInsurancesPage() {
  const list = useAsync(() => adminApi.healthInsurances(), []);
  const [editing, setEditing] = useState<HealthInsurance | 'new' | null>(null);

  const toggle = async (h: HealthInsurance) => {
    try {
      await adminApi.updateHealthInsurance(h.id, { active: !h.active });
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Obras sociales"
        description="Las que se atienden. El paciente elige una al pedir turno (o &quot;Particular&quot;). Las inactivas dejan de ofrecerse; los legajos que ya la tenían la conservan."
        actions={<Button onClick={() => setEditing('new')}>Nueva obra social</Button>}
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title="Todavía no hay obras sociales"
          action={<Button onClick={() => setEditing('new')}>Cargar la primera</Button>}
        >
          Mientras no haya ninguna, los pacientes solo pueden elegir &quot;Particular&quot;.
        </EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <p className={`font-medium ${h.active ? '' : 'text-ink-faint'}`}>{h.name}</p>
                <div className="flex items-center gap-2">
                  <ActiveChip active={!!h.active} />
                  <Button size="sm" variant="secondary" onClick={() => setEditing(h)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(h)}>
                    {h.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {editing && (
        <HealthInsuranceModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function HealthInsuranceModal({
  item,
  onClose,
  onSaved,
}: {
  item: HealthInsurance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (item) await adminApi.updateHealthInsurance(item.id, { name });
      else await adminApi.createHealthInsurance({ name });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Editar obra social' : 'Nueva obra social'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="health-insurance-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="health-insurance-form" onSubmit={save} className="grid gap-4">
        <TextInput
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Como lo reconoce el paciente, por ejemplo: OSDE, PAMI, Swiss Medical."
        />
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Consultorios
// ------------------------------------------------------------------

export function OfficesPage() {
  const list = useAsync(() => adminApi.offices(), []);
  const [editing, setEditing] = useState<Office | 'new' | null>(null);

  const toggle = async (o: Office) => {
    try {
      await adminApi.updateOffice(o.id, { active: !o.active });
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Consultorios"
        description="Donde atiende cada profesional. La dirección aparece en el comprobante del turno."
        actions={<Button onClick={() => setEditing('new')}>Nuevo consultorio</Button>}
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title="Todavía no hay consultorios"
          action={<Button onClick={() => setEditing('new')}>Crear el primero</Button>}
        >
          Hacen falta para cargar los horarios de atención.
        </EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className={o.active ? '' : 'text-ink-faint'}>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-sm text-ink-soft">
                    {o.address}
                    {o.locationDetails && `, ${o.locationDetails}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ActiveChip active={o.active} masculine />
                  <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(o)}>
                    {o.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {editing && (
        <OfficeModal
          office={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function OfficeModal({
  office,
  onClose,
  onSaved,
}: {
  office: Office | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: office?.name ?? '',
    address: office?.address ?? '',
    locationDetails: office?.locationDetails ?? '',
    phone: office?.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      address: form.address,
      ...(form.locationDetails.trim() && { locationDetails: form.locationDetails.trim() }),
      ...(form.phone.trim() && { phone: form.phone.trim() }),
    };
    try {
      if (office) await adminApi.updateOffice(office.id, body);
      else await adminApi.createOffice(body);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={office ? 'Editar consultorio' : 'Nuevo consultorio'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="office-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="office-form" onSubmit={save} className="grid gap-4">
        <TextInput label="Nombre" required value={form.name} onChange={set('name')} placeholder="Consultorio 2" />
        <TextInput label="Dirección" required value={form.address} onChange={set('address')} />
        <TextInput
          label="Indicaciones (opcional)"
          value={form.locationDetails}
          onChange={set('locationDetails')}
          placeholder="Piso 1, al fondo del pasillo"
        />
        <TextInput label="Teléfono (opcional)" type="tel" value={form.phone} onChange={set('phone')} />
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}
