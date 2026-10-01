// src/components/SessionSync.tsx
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { UserKey, createUser, resetUser } from '@/redux/states/user';

/**
 * Si la sesión cambia en otra pestaña (login o logout), el evento
 * "storage" avisa acá para mantenerlas sincronizadas. El navegador solo
 * dispara este evento en pestañas *distintas* a la que hizo el cambio (no
 * en la propia), así que no hay riesgo de loop. (Antes vivía en Header.tsx,
 * que se reemplazó por los layouts público y del personal.)
 */
export function SessionSync() {
  const dispatch = useDispatch();

  useEffect(() => {
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== UserKey) {
        return;
      }
      if (!event.newValue) {
        dispatch(resetUser());
        return;
      }
      try {
        dispatch(createUser(JSON.parse(event.newValue)));
      } catch {
        dispatch(resetUser());
      }
    };

    window.addEventListener('storage', onStorageChange);
    return () => window.removeEventListener('storage', onStorageChange);
  }, [dispatch]);

  return null;
}

export default SessionSync;
