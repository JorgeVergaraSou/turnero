import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/utilities';

interface AsyncState<T> {
  /** clave (deps + recargas) de la última carga resuelta */
  key: string | null;
  data: T | null;
  error: string;
}

/**
 * Carga de datos para una pantalla: { data, loading, error, reload }.
 *
 * `loading` no es un estado aparte: se deriva comparando la clave actual
 * (dependencias + contador de recargas) con la de la última respuesta. Así
 * el efecto nunca hace setState sincrónico, y una respuesta vieja (ej.
 * cambiar rápido de fecha en la agenda) se descarta sola porque su clave
 * ya no coincide. `enabled=false` no dispara la carga (falta elegir algo).
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], enabled = true) {
  const [reloads, setReloads] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ key: null, data: null, error: '' });
  const key = `${JSON.stringify(deps)}#${reloads}`;

  // siempre la última versión del loader, sin volver a disparar el efecto
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    loaderRef.current().then(
      (data) => current && setState({ key, data, error: '' }),
      (err) => current && setState((s) => ({ key, data: s.data, error: getErrorMessage(err) })),
    );
    return () => {
      current = false;
    };
  }, [key, enabled]);

  const loading = enabled && state.key !== key;
  return {
    data: state.data,
    setData: (data: T | null) => setState((s) => ({ ...s, data })),
    loading,
    error: loading ? '' : state.error,
    reload: () => setReloads((n) => n + 1),
  };
}
