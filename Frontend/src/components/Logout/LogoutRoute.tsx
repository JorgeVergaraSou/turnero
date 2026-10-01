import { useEffect, useRef } from 'react';
import useLogout from './Logout';

/**
 * Ruta /logout: además de ser una entrada directa (URL a mano, favorito),
 * es la única fuente real de qué implica "cerrar sesión" — antes esta ruta
 * solo redirigía a /login sin tocar la sesión, dejando el token vivo en
 * localStorage si alguien entraba acá directamente.
 */
export function LogoutRoute() {
  const logOut = useLogout();
  const yaDisparado = useRef(false);

  useEffect(() => {
    // Guarda contra el doble-render de efectos que hace React.StrictMode en
    // desarrollo — sin esto, el diálogo de confirmación aparecería dos veces.
    if (yaDisparado.current) {
      return;
    }

    yaDisparado.current = true;
    logOut();
  }, [logOut]);

  return null;
}

export default LogoutRoute;
