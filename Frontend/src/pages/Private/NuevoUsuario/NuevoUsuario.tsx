import { useState } from "react";
import { registerService } from "@/services";
import { Roles } from "@/models";
import { getErrorMessage, showSuccess } from "@/utilities";
import { Button, ErrorNotice, PageHeader, Panel, SelectInput, TextInput } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  RECEPCIONISTA: 'Recepción',
  MEDICO: 'Médico/a',
};

/**
 * Alta de usuarios — ruta solo para ADMIN (RoleGuard en App.tsx; el backend
 * lo vuelve a exigir con @Auth(Role.ADMIN), que es la protección real).
 * No hay registro público.
 *
 * El <select> de rol NO ofrece ADMIN a propósito: crear otro ADMIN no está
 * disponible desde la UI. Ojo: el backend técnicamente lo aceptaría
 * (RegisterDto valida contra el enum completo) — si hace falta bloquearlo
 * de verdad, esa regla va en AuthService.registro, no acá.
 */
const ROLES_ASIGNABLES = [Roles.RECEPCIONISTA, Roles.MEDICO];

const estadoInicial = {
  nickUsuario: '',
  nombre: '',
  apellido: '',
  email: '',
  password: '',
  passwordRepeat: '',
  role: Roles.RECEPCIONISTA,
};

function NuevoUsuarioPage() {

  const [form, setForm] = useState(estadoInicial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { nickUsuario, nombre, apellido, email, password, passwordRepeat, role } = form;

    // Validaciones de UX — el backend valida todo de nuevo por su cuenta
    // (formato de nick, política de contraseña, duplicados).
    if (!nickUsuario.trim() || !nombre.trim() || !apellido.trim() || !email.trim() || !password) {
      return setError('Completá usuario, nombre, apellido, email y contraseña');
    }
    if (password !== passwordRepeat) {
      return setError('Las contraseñas no coinciden');
    }
    setLoading(true);
    setError('');
    try {
      await registerService({
        nickUsuario: nickUsuario.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        password,
        role,
      });
      await showSuccess('Usuario creado', `Ya puede iniciar sesión como "${nickUsuario.trim()}".`);
      setForm(estadoInicial);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nuevo usuario"
        description="Para médicos: después de crear el usuario, dale su perfil profesional en Profesionales."
      />
      <Panel className="p-6">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <TextInput label="Nombre" name="nombre" value={form.nombre} onChange={handleChange} />
          <TextInput label="Apellido" name="apellido" value={form.apellido} onChange={handleChange} />
          <TextInput
            label="Usuario para iniciar sesión"
            name="nickUsuario"
            autoComplete="off"
            placeholder="jperez"
            value={form.nickUsuario}
            onChange={handleChange}
          />
          <SelectInput label="Rol" name="role" value={form.role} onChange={handleChange}>
            {ROLES_ASIGNABLES.map((role) => (
              <option key={role} value={role}>{ROLE_LABEL[role]}</option>
            ))}
          </SelectInput>
          <TextInput
            label="Email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            wrapperClassName="sm:col-span-2"
            hint="Obligatorio: es la única forma de que recupere la contraseña por su cuenta."
          />
          <TextInput
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, un número y una mayúscula."
            value={form.password}
            onChange={handleChange}
          />
          <TextInput
            label="Repetí la contraseña"
            name="passwordRepeat"
            type="password"
            autoComplete="new-password"
            value={form.passwordRepeat}
            onChange={handleChange}
          />
          {error && (
            <div className="sm:col-span-2">
              <ErrorNotice message={error} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={loading}>Crear usuario</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

export default NuevoUsuarioPage;
