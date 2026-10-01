import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPasswordService } from '@/services';
import { PublicRoutes } from '@/models';
import { getErrorMessage, showSuccess } from '@/utilities';
import { Button, ErrorNotice, TextInput } from '@/components/ui';

/**
 * Ruta pública (/reset-password?token=<uuid>) — el link que llega por mail.
 * Quien la usa por definición no puede loguearse, así que no va dentro del
 * AuthGuard. La política de contraseña (8+ caracteres, un número, una
 * mayúscula) la valida el backend; el mensaje de error llega tal cual.
 */
function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordRepeatInput, setPasswordRepeatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return setError('El link no es válido: falta el token. Pedí uno nuevo desde el login.');
    }
    if (!passwordInput) {
      return setError('La contraseña no puede estar vacía');
    }
    if (passwordInput !== passwordRepeatInput) {
      return setError('Las contraseñas no coinciden');
    }
    setLoading(true);
    setError('');
    try {
      await resetPasswordService(passwordInput, token);
      await showSuccess('¡Clave actualizada!', 'Ya podés iniciar sesión con tu nueva clave.');
      navigate(`/${PublicRoutes.LOGIN}`, { replace: true });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">Nueva contraseña</h1>
        {!token ? (
          <div className="mt-4">
            <ErrorNotice message="El link no es válido: falta el token. Pedí uno nuevo desde el acceso del personal." />
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 grid gap-4" noValidate>
            <TextInput
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              hint="Mínimo 8 caracteres, con al menos un número y una mayúscula."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            <TextInput
              label="Repetí la contraseña"
              type="password"
              autoComplete="new-password"
              value={passwordRepeatInput}
              onChange={(e) => setPasswordRepeatInput(e.target.value)}
            />
            <Button type="submit" size="lg" loading={loading}>
              Guardar contraseña
            </Button>
          </form>
        )}
        {error && token && (
          <div className="mt-4">
            <ErrorNotice message={error} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
