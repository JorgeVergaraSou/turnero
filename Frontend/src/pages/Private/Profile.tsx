import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { resetUser } from "@/redux/states/user";
import { PublicRoutes } from "@/models";
import { AppStore } from "@/redux/store";
import { useEffect, useState } from "react";
import { profileService, updateUserService } from "@/services";
import { getErrorMessage } from "@/utilities";
import { User } from "@/interfaces";
import { Button, Notice, PageHeader, Panel, TextInput } from "@/components/ui";

function ProfilePage() {
  const user = useSelector((state: AppStore) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState('');
  const [profileData, setProfileData] = useState<User | null>(null); // Estado para los datos del perfil

  // Función para obtener datos del perfil
  const fetchProfileData = async () => {

    try {
      const response = await profileService();
      setProfileData(response); // GET /auth/profile devuelve el perfil directo (sin wrapper)
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  // No usa fetchProfileData() acá: el linter (react-hooks/set-state-in-effect,
  // desde eslint-plugin-react-hooks 7) marca como error llamar dentro de un
  // efecto a una función que termina llamando setState, aunque sea async.
  // Encadenar la promesa evita el falso positivo; fetchProfileData() sigue
  // usándose para refrescar el perfil después de un update (handleUpdate).
  useEffect(() => {
    profileService()
      .then((response) => setProfileData(response))
      .catch((error) => setMessage(getErrorMessage(error)));
  }, []);

  const handleUpdate = async (field: string) => {

    const fieldValidations: Record<string, { value: string; message: string }> = {
      nombre: { value: newName, message: 'El campo nombre no puede estar vacío.' },
      email: { value: newEmail, message: 'El campo email no puede estar vacío.' },
      password: { value: newPassword, message: 'El campo contraseña no puede estar vacío.' },
    };

    // Verifica si el campo que se está actualizando tiene un valor vacío
    if (fieldValidations[field] && fieldValidations[field].value.trim() === '') {
      setMessage(fieldValidations[field].message);
      return;
    }

    // Crea el objeto de datos a actualizar
    const updateData: Record<string, unknown> = { currentPassword };

    // Asigna el valor al campo correspondiente
    if (field in fieldValidations) {
      updateData[field] = fieldValidations[field].value;
    }

    try {
      // El backend no manda mensaje de éxito (responde vacío) — el texto es propio.
      await updateUserService(user.idUser, updateData);

      // al cambiar la clave, el backend invalida las sesiones abiertas
      // (incluida esta): se avisa y se vuelve al login con la nueva
      if (field === 'password') {
        await Swal.fire({
          icon: 'success',
          title: 'Contraseña cambiada',
          text: 'Por seguridad se cerraron todas tus sesiones. Volvé a iniciar sesión con la nueva contraseña.',
          confirmButtonText: 'Ir al inicio de sesión',
        });
        dispatch(resetUser());
        navigate(`/${PublicRoutes.LOGIN}`, { replace: true });
        return;
      }

      setMessage('Datos actualizados.');

      await fetchProfileData();

    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setCurrentPassword('');
    }
  };


  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Mi perfil"
        description={
          profileData &&
          `${profileData.nombre} ${profileData.apellido}, usuario ${profileData.nickUsuario}`
        }
      />
      {profileData && (
        <p className="mb-4 text-sm text-ink-soft">
          Verificación en dos pasos:{' '}
          {profileData.twoFactorEnabled ? (
            <strong className="text-st-confirmed">activada</strong>
          ) : (
            'no configurada (se configura al ingresar, si tu rol la requiere)'
          )}
        </p>
      )}
      <Panel className="grid gap-6 p-6">
        <TextInput
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          hint="Se pide para confirmar cualquier cambio."
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        {profileData && (
          <>
            <div className="flex items-end gap-2">
              <TextInput
                label="Nombre"
                placeholder={profileData.nombre}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                wrapperClassName="flex-1"
              />
              <Button variant="secondary" className="h-11" onClick={() => handleUpdate('nombre')}>
                Cambiar nombre
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <TextInput
                label="Email"
                type="email"
                placeholder={profileData.email ?? 'Sin cargar'}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                wrapperClassName="flex-1"
              />
              <Button variant="secondary" className="h-11" onClick={() => handleUpdate('email')}>
                Cambiar email
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <TextInput
                label="Nueva contraseña"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                wrapperClassName="flex-1"
              />
              <Button variant="secondary" className="h-11" onClick={() => handleUpdate('password')}>
                Cambiar contraseña
              </Button>
            </div>
          </>
        )}
        {message && <Notice>{message}</Notice>}
      </Panel>
    </div>
  );
}

export default ProfilePage;
