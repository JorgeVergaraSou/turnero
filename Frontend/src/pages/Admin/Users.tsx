import { useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useSelector } from 'react-redux';
import { adminApi } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import type { StaffUser } from '@/interfaces';
import { Roles, StaffPaths } from '@/models';
import { AppStore } from '@/redux/store';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Notice,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
} from '@/components/ui';
import { dateTime, getErrorMessage, showError, showSuccess } from '@/utilities';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administración',
  RECEPCIONISTA: 'Recepción',
  MEDICO: 'Médico/a',
};

/**
 * Usuarios del personal. Baja lógica: un usuario dado de baja no puede
 * entrar. Las reglas (no quedarse sin admins, no cambiarse el propio rol,
 * médico con perfil activo) las aplica el backend; acá se muestran sus
 * mensajes tal cual.
 */
export function UsersPage() {
  const me = useSelector((state: AppStore) => state.user);
  const list = useAsync(() => adminApi.users(), []);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [resetting, setResetting] = useState<StaffUser | null>(null);

  const toggle = async (u: StaffUser) => {
    const deactivating = !u.deletedAt;
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: deactivating ? 'Dar de baja' : 'Reactivar',
      text: deactivating
        ? `${u.nombre} ${u.apellido} no va a poder iniciar sesión. Su información histórica se conserva.`
        : `${u.nombre} ${u.apellido} va a poder volver a iniciar sesión.`,
      showCancelButton: true,
      confirmButtonText: deactivating ? 'Dar de baja' : 'Reactivar',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    try {
      if (deactivating) await adminApi.deactivateUser(u.idUser);
      else await adminApi.activateUser(u.idUser);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const resetTwoFactor = async (u: StaffUser) => {
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Reiniciar verificación en dos pasos',
      text: `Usalo si ${u.nombre} ${u.apellido} perdió o cambió el celular. En su próximo ingreso va a tener que configurar la app de nuevo (escaneando un QR).`,
      showCancelButton: true,
      confirmButtonText: 'Reiniciar',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    try {
      await adminApi.resetTwoFactor(u.idUser);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const unlock = async (u: StaffUser) => {
    try {
      await adminApi.unlockUser(u.idUser);
      showSuccess('Usuario desbloqueado', `${u.nombre} ${u.apellido} ya puede volver a iniciar sesión.`);
      list.reload();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Usuarios"
        description="Cuentas del personal. Los pacientes no tienen usuario."
        actions={
          <Link
            to={StaffPaths.NEW_USER}
            className="inline-flex h-10 items-center rounded-(--radius-control) bg-eucalyptus px-4 font-medium text-white hover:bg-eucalyptus-dark"
          >
            Nuevo usuario
          </Link>
        }
      />
      {(() => {
        const withoutEmail = list.data?.filter((u) => !u.email && !u.deletedAt).length ?? 0;
        return withoutEmail > 0 ? (
          <div className="mb-4">
            <Notice>
              {withoutEmail === 1 ? 'Hay 1 usuario' : `Hay ${withoutEmail} usuarios`} sin email. No pueden
              recuperar la contraseña por su cuenta: cargales uno con &quot;Editar&quot;.
            </Notice>
          </div>
        ) : null;
      })()}
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="No hay usuarios" />
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line-soft">
            {list.data.map((u) => {
              const isMe = u.idUser === me.idUser;
              return (
                <li key={u.idUser} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className={u.deletedAt ? 'text-ink-faint' : ''}>
                    <p className="font-medium">
                      {u.apellido}, {u.nombre}
                      {isMe && <span className="font-normal text-ink-soft"> (vos)</span>}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {u.nickUsuario}, {ROLE_LABEL[u.role] ?? u.role}
                      {u.email && `, ${u.email}`}
                      {u.deletedAt && ' (dado de baja)'}
                    </p>
                    {!u.email && !u.deletedAt && (
                      <span className="mt-1 mr-1.5 inline-block rounded-(--radius-control) bg-st-attention-wash px-1.5 py-0.5 text-xs font-medium text-st-attention">
                        Sin email
                      </span>
                    )}
                    {u.twoFactorEnabled && (
                      <span className="mt-1 mr-1.5 inline-block rounded-(--radius-control) bg-st-confirmed-wash px-1.5 py-0.5 text-xs font-medium text-st-confirmed">
                        Verificación en dos pasos
                      </span>
                    )}
                    {u.lockedUntil && (
                      <span className="mt-1 inline-block rounded-(--radius-control) bg-st-cancelled-wash px-1.5 py-0.5 text-xs font-medium text-st-cancelled">
                        Bloqueado por intentos fallidos hasta {dateTime(u.lockedUntil).slice(-5)}
                      </span>
                    )}
                  </div>
                  {!isMe && (
                    <div className="flex gap-1.5">
                      {u.lockedUntil && (
                        <Button size="sm" onClick={() => unlock(u)}>
                          Desbloquear
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                        Cambiar clave
                      </Button>
                      {u.twoFactorEnabled && (
                        <Button size="sm" variant="ghost" onClick={() => resetTwoFactor(u)}>
                          Reiniciar 2 pasos
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => toggle(u)}>
                        {u.deletedAt ? 'Reactivar' : 'Dar de baja'}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email ?? '',
    role: user.role,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [field]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.updateUser(user.idUser, {
        nombre: form.nombre,
        apellido: form.apellido,
        role: form.role,
        ...(form.email.trim() && { email: form.email.trim() }),
      });
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
      title={`Editar a ${user.nombre} ${user.apellido}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="edit-user-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" required value={form.nombre} onChange={set('nombre')} />
        <TextInput label="Apellido" required value={form.apellido} onChange={set('apellido')} />
        <TextInput
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={set('email')}
          wrapperClassName="sm:col-span-2"
          hint="Obligatorio: para que pueda recuperar la contraseña por su cuenta."
        />
        <SelectInput
          label="Rol"
          value={form.role}
          onChange={set('role')}
          wrapperClassName="sm:col-span-2"
          hint={
            user.role === Roles.MEDICO
              ? 'Si tiene perfil profesional activo, desactivalo primero en Profesionales.'
              : undefined
          }
        >
          {[Roles.RECEPCIONISTA, Roles.MEDICO, Roles.ADMIN].map((role) => (
            <option key={role} value={role}>{ROLE_LABEL[role]}</option>
          ))}
        </SelectInput>
        <p className="text-sm text-ink-soft sm:col-span-2">
          El usuario para iniciar sesión ({user.nickUsuario}) no se cambia desde acá.
        </p>
        {error && (
          <div className="sm:col-span-2">
            <ErrorNotice message={error} />
          </div>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.resetUserPassword(user.idUser, password);
      onClose();
      showSuccess(
        'Clave cambiada',
        `Pasale la clave nueva a ${user.nombre} por un medio seguro y pedile que la cambie desde Mi perfil.`,
      );
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
      title={`Cambiar la clave de ${user.nombre} ${user.apellido}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="reset-password-form" loading={saving}>Cambiar clave</Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={save} className="grid gap-4">
        <TextInput
          label="Clave nueva"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo 8 caracteres, un número y una mayúscula."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextInput
          label="Repetí la clave"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  );
}

export default UsersPage;
