import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import { createUser } from '@/redux/states/user';
import { loginService, requestResetPasswordService } from '@/services';
import { getErrorMessage, getRoleRoute, showSuccess } from '@/utilities';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { Roles } from '@/models';
import { Button, ErrorNotice, TextInput } from '@/components/ui';
import type { Session, TwoFactorChallenge } from '@/services/auth.service';
import { SetupStep, VerifyStep } from './TwoFactorSteps';

function Login() {
  const [nickInput, setNickInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 2.º paso pendiente (verificación en dos pasos)
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { clinicName } = useClinicSettings();

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nickInput || !passwordInput) {
      return setError('Todos los campos son obligatorios');
    }
    setLoading(true);
    setError('');
    try {
      const result = await loginService(nickInput, passwordInput);
      if ('twoFactor' in result) setChallenge(result);
      else finish(result);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  /** Sesión abierta (con o sin 2.º paso): guardar y entrar. */
  const finish = ({ token, nickUsuario, role, name, idUser }: Session) => {
    dispatch(createUser({ nickUsuario, role, token, name, idUser }));
    // Obtener la ruta de redirección de la query string
    const query = new URLSearchParams(location.search);
    const redirectPath = query.get('redirect') || getRoleRoute(role as Roles);
    navigate(redirectPath, { replace: true });
  };

  const backToPassword = () => {
    setChallenge(null);
    setPasswordInput('');
    setError('');
  };

  // Pide nickUsuario + email juntos (así lo exige el backend). Si el
  // usuario ya tiene un email guardado, el mail va a ese y el ingresado
  // acá se ignora — por eso el mensaje de éxito no nombra ningún email.
  const handleForgotPassword = async () => {
    const { value: enviado } = await Swal.fire({
      title: 'Recuperar contraseña',
      html:
        '<input id="swal-nick" class="swal2-input" placeholder="Nombre de usuario" autocomplete="username">' +
        '<input id="swal-email" type="email" class="swal2-input" placeholder="email@email.com" autocomplete="email">',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        const nickUsuario = (document.getElementById('swal-nick') as HTMLInputElement | null)?.value.trim() ?? '';
        const email = (document.getElementById('swal-email') as HTMLInputElement | null)?.value.trim() ?? '';

        if (!nickUsuario || !email) {
          Swal.showValidationMessage('Completá tu nombre de usuario y tu email.');
          return false;
        }

        try {
          await requestResetPasswordService(nickUsuario, email);
          return true;
        } catch (error) {
          Swal.showValidationMessage(getErrorMessage(error));
          return false;
        }
      },
    });

    if (enviado) {
      showSuccess(
        'Pedido enviado',
        'Si el usuario y el email coinciden con los registrados, vas a recibir un mail con un link para cambiar la clave. El link vence en 10 minutos. Si tu usuario no tiene email cargado, pedile al administrador que te restablezca la clave.',
      );
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5 text-lg font-bold">
          <img src="/favicon.svg" alt="" className="size-8" />
          {clinicName}
        </div>
        {challenge ? (
          <>
            <h1 className="text-2xl font-bold">Verificación en dos pasos</h1>
            {challenge.twoFactor === 'setup' ? (
              <SetupStep challengeToken={challenge.challengeToken} onDone={finish} onBack={backToPassword} />
            ) : (
              <VerifyStep challengeToken={challenge.challengeToken} onDone={finish} onBack={backToPassword} />
            )}
          </>
        ) : (
        <>
        <h1 className="text-2xl font-bold">Acceso del personal</h1>
        <p className="mt-1 text-ink-soft">Recepción, médicos y administración.</p>

        <form onSubmit={handleLogin} className="mt-6 grid gap-4" noValidate>
          <TextInput
            label="Usuario"
            name="nickUsuario"
            autoComplete="username"
            autoFocus
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
          />
          <TextInput
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
          />
          {error && <ErrorNotice message={error} />}
          <Button type="submit" size="lg" loading={loading}>
            Entrar
          </Button>
          <button
            type="button"
            onClick={handleForgotPassword}
            className="justify-self-start text-eucalyptus underline underline-offset-2"
          >
            Olvidé mi contraseña
          </button>
        </form>
        </>
        )}

        <p className="mt-10 text-ink-soft">
          ¿Sos paciente?{' '}
          <Link to="/" className="text-eucalyptus underline underline-offset-2">
            Pedí tu turno acá
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
