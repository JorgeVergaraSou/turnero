//src/guards/auth.guard.tsx
import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';

import { PrivateRoutes, PublicRoutes } from '@/models';
import { AppStore } from '@/redux/store';
import { GuardProps } from '@/interfaces';

/**
 * La validación de expiración del token vive en un solo lugar
 * (getInitialUserState, en redux/states/user.ts) en vez de repetirse acá
 * en cada cambio de ruta: se revisa una vez al hidratar el store, y de
 * ahí en más el interceptor de axios (src/api/axios.ts) se encarga de
 * cerrar la sesión ante un 401. Este guard solo decide si hay o no un
 * usuario logueado.
 */
export const AuthGuard = ({
  privateValidation,
}: GuardProps) => {

  const userState = useSelector(
    (store: AppStore) => store.user,
  );

  if (!userState.token) {
    return (
      <Navigate
        replace
        to={PublicRoutes.LOGIN}
      />
    );
  }

  return privateValidation
    ? <Outlet />
    : <Navigate replace to={PrivateRoutes.PRIVATE} />;
};

export default AuthGuard;
