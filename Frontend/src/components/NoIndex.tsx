import { Outlet } from 'react-router-dom';
import { PrivateTitle } from './Seo';

/**
 * Pide a los buscadores que no indexen ni sigan los enlaces de esta pantalla
 * (login, pantalla de sala, paneles del personal, enlaces de un solo uso).
 *
 * React 19 sube cualquier <meta> renderizado en un componente al <head> y lo
 * quita cuando la ruta se desmonta, así que no hace falta ninguna librería.
 * Solo lo ven los buscadores que ejecutan JavaScript; para los demás vale el
 * robots.txt (public/robots.txt).
 */
export function NoIndex() {
  return <meta name="robots" content="noindex, nofollow" />;
}

/** Layout de rutas sin contenido propio: agrega el noindex a todas las rutas hijas. */
export function NoIndexLayout() {
  return (
    <>
      <NoIndex />
      <PrivateTitle />
      <Outlet />
    </>
  );
}
