import { useEffect, useState } from 'react';

/**
 * Devuelve `value` recién cuando dejó de cambiar durante `delay` ms. Para
 * buscadores en vivo: se busca cuando el usuario hace una pausa al teclear,
 * no con cada letra (menos pedidos al servidor y resultados que no
 * "saltan" mientras escribe). Las respuestas viejas las descarta useAsync.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
