import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { Professional } from '@/interfaces';
import { StaffPaths } from '@/models';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { ActiveChip } from './Catalogs';
import { getErrorMessage, showError } from '@/utilities';

/**
 * Perfiles profesionales. Un profesional es un usuario MEDICO (credenciales
 * y acceso) + este perfil (matrícula y especialidades): primero se crea el
 * usuario, después se le da el perfil.
 */
export function ProfessionalsPage() {
  const list = useAsync(() => adminApi.professionals(), []);
  const [editing, setEditing] = useState<Professional | 'new' | null>(null);

  const toggle = async (p: Professional) => {
    try {
      await adminApi.updateProfessional(p.id, { active: !p.active });
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Profesionales"
        description="Un inactivo deja de recibir turnos nuevos; su historial queda intacto."
        actions={<Button onClick={() => setEditing('new')}>Nuevo profesional</Button>}
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState
          title="Todavía no hay profesionales"
          action={<Button onClick={() => setEditing('new')}>Dar de alta el primero</Button>}
        >
          Necesitás un usuario con rol médico y al menos una especialidad.
        </EmptyState>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="border-b border-line text-sm text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Profesional</th>
                <th scope="col" className="px-4 py-3 font-medium">Matrícula</th>
                <th scope="col" className="px-4 py-3 font-medium">Especialidades</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {p.lastName}, {p.firstName}
                    </span>
                    <span className="block text-sm text-ink-soft">Usuario {p.nickUsuario}</span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular">{p.licenseNumber}</td>
                  <td className="px-4 py-3">{p.specialties.map((s) => s.name).join(', ')}</td>
                  <td className="px-4 py-3">
                    <ActiveChip active={p.active && p.userActive} masculine />
                    {!p.userActive && (
                      <span className="block text-sm text-st-cancelled">Usuario dado de baja</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        to={`${StaffPaths.SCHEDULES}?profesional=${p.id}`}
                        className="inline-flex h-8 items-center rounded-(--radius-control) px-3 text-sm hover:bg-line-soft"
                      >
                        Horarios
                      </Link>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                        {p.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {editing && (
        <ProfessionalModal
          professional={editing === 'new' ? null : editing}
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

function ProfessionalModal({
  professional,
  onClose,
  onSaved,
}: {
  professional: Professional | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const specialties = useAsync(() => adminApi.specialties(), []);
  const eligible = useAsync(() => adminApi.eligibleUsers(), [], !professional);
  const [userId, setUserId] = useState<number | ''>('');
  const [licenseNumber, setLicenseNumber] = useState(professional?.licenseNumber ?? '');
  const [specialtyIds, setSpecialtyIds] = useState<number[]>(
    professional?.specialties.map((s) => s.id) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleSpecialty = (id: number) =>
    setSpecialtyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialtyIds.length) {
      setError('Elegí al menos una especialidad.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (professional) {
        await adminApi.updateProfessional(professional.id, { licenseNumber, specialtyIds });
      } else {
        await adminApi.createProfessional({ userId: Number(userId), licenseNumber, specialtyIds });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const noEligible = !professional && eligible.data && eligible.data.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={professional ? `Editar a ${professional.firstName} ${professional.lastName}` : 'Nuevo profesional'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="professional-form" loading={saving} disabled={!!noEligible}>
            Guardar
          </Button>
        </>
      }
    >
      {noEligible ? (
        <Notice>
          No hay usuarios médicos sin perfil.{' '}
          <Link to={StaffPaths.NEW_USER} className="font-medium underline underline-offset-2">
            Creá primero el usuario
          </Link>{' '}
          con rol MEDICO y volvé acá.
        </Notice>
      ) : (
        <form id="professional-form" onSubmit={save} className="grid gap-4">
          {!professional && (
            <SelectInput
              label="Usuario médico"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}
              hint="Usuarios con rol MEDICO que todavía no tienen perfil profesional."
            >
              <option value="">Elegí un usuario</option>
              {(eligible.data ?? []).map((u) => (
                <option key={u.idUser} value={u.idUser}>
                  {u.apellido}, {u.nombre} ({u.nickUsuario})
                </option>
              ))}
            </SelectInput>
          )}
          <TextInput
            label="Matrícula"
            required
            className="font-mono tabular"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
          />
          <fieldset>
            <legend className="text-sm font-medium">Especialidades</legend>
            {specialties.loading ? (
              <Spinner />
            ) : (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {(specialties.data ?? [])
                  .filter((s) => s.active || specialtyIds.includes(s.id))
                  .map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-(--radius-control) border border-line px-3 py-2 has-checked:border-eucalyptus has-checked:bg-eucalyptus-wash"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-eucalyptus"
                        checked={specialtyIds.includes(s.id)}
                        onChange={() => toggleSpecialty(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
              </div>
            )}
          </fieldset>
          {error && <ErrorNotice message={error} />}
        </form>
      )}
    </Modal>
  );
}

export default ProfessionalsPage;
