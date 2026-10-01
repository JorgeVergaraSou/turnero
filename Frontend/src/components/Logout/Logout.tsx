import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import { resetUser } from '@/redux/states/user';
import { PublicRoutes } from '@/models';
import { logoutService } from '@/services/auth.service';

function useLogout() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // useCallback para que la identidad de logOut sea estable entre renders
  // (dispatch y navigate ya lo son): LogoutRoute la usa como dependencia de
  // un efecto, y sin esto se dispararía en cada render.
  const logOut = useCallback(async () => {
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Cerrar sesión',
      text: '¿Querés cerrar la sesión?',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
    });

    if (!isConfirmed) {
      return;
    }

    // primero se anula en el servidor; si falla, se cierra igual acá
    await logoutService().catch(() => undefined);
    // resetUser ya limpia el localStorage (ver redux/states/user.ts), no
    // hace falta duplicarlo acá.
    dispatch(resetUser());
    navigate(`/${PublicRoutes.LOGIN}`, { replace: true });
  }, [dispatch, navigate]);

  return logOut;
}

export default useLogout;
