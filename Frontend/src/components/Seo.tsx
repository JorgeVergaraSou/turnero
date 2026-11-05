import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { PrivateRoutes, PublicRoutes } from '@/models';

/**
 * Título y metadatos por pantalla. React 19 sube <title> y <meta> al <head> y los
 * quita al cambiar de ruta (sin librerías). Solo los ven los buscadores y los
 * bots de vista previa que ejecutan JavaScript: Google sí; WhatsApp y Facebook no,
 * porque leen el HTML estático (index.html).
 */

/**
 * Dirección pública del sitio, SIN barra final (og:url y og:image deben ser absolutas).
 * Se define en el .env de producción (VITE_SITE_URL). Mientras no se defina queda el marcador.
 */
const SITE_URL: string = (import.meta.env.VITE_SITE_URL || 'https://DOMINIO-A-DEFINIR').replace(/\/+$/, '');

/** Imagen de vista previa (1200×630 px, PNG o JPG) en /public. PENDIENTE: todavía no existe. */
const OG_IMAGE_PATH = '/og-image.png';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

type PublicPage = 'booking' | 'myAppointment' | 'privacy';

const publicPages: Record<PublicPage, { path: string; title: (clinic: string) => string; description: (clinic: string) => string }> = {
  booking: {
    path: '/',
    title: (clinic) => `Pedí tu turno online — ${clinic}`,
    description: (clinic) =>
      `Reservá tu turno en ${clinic} sin crear una cuenta. Elegí especialidad, profesional, día y horario, y recibí tu código de turno al instante.`,
  },
  myAppointment: {
    path: `/${PublicRoutes.MY_APPOINTMENT}`,
    title: (clinic) => `Consultá o cancelá tu turno — ${clinic}`,
    description: (clinic) =>
      `Consultá el estado de tu turno en ${clinic} o cancelalo con tu código de turno y tu DNI, sin iniciar sesión.`,
  },
  privacy: {
    path: `/${PublicRoutes.PRIVACY}`,
    title: (clinic) => `Política de privacidad — ${clinic}`,
    description: (clinic) =>
      `Cómo ${clinic} cuida tus datos personales y de salud: qué datos pedimos, para qué los usamos y cómo ejercer tus derechos.`,
  },
};

/**
 * Quita del <head> todo lo estático de index.html (título, description, Open Graph y Twitter Card,
 * marcado con data-static): sirve a quienes no ejecutan JavaScript, pero React agrega el de cada
 * pantalla y, si el estático siguiera ahí, habría duplicados (ambiguo para los buscadores). En las
 * pantallas privadas no queda ninguno de los dos: no se comparten ni se indexan.
 */
export function StaticHeadCleanup() {
  useEffect(() => {
    document.head.querySelectorAll('[data-static]').forEach((element) => element.remove());
  }, []);
  return null;
}

/** Título, descripción, Open Graph y Twitter Card de una página PÚBLICA (la única que se comparte y se indexa). */
export function PublicMeta({ page }: { page: PublicPage }) {
  const { clinicName } = useClinicSettings();
  const config = publicPages[page];
  const title = clip(config.title(clinicName), TITLE_MAX);
  const description = clip(config.description(clinicName), DESCRIPTION_MAX);
  const url = `${SITE_URL}${config.path}`;
  const image = `${SITE_URL}${OG_IMAGE_PATH}`;
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={clinicName} />
      <meta property="og:locale" content="es_AR" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  );
}

const { ADMIN, RECEPCION, MEDICO } = PrivateRoutes;

/** Título de las pantallas privadas: simple y distinto por pantalla, sin datos de pacientes. */
const privateTitles: Array<[string, string]> = [
  [`/${PublicRoutes.LOGIN}`, 'Ingreso del personal'],
  [`/${PublicRoutes.RESET_PASSWORD}`, 'Restablecer contraseña'],
  [`/${PublicRoutes.DISPLAY}`, 'Pantalla de sala'],
  [`/${PublicRoutes.CONFIRM}`, 'Confirmar asistencia'],
  [`/${PrivateRoutes.PRIVATE}/*`, 'Panel del personal'],
  [`/${PrivateRoutes.PERFIL}`, 'Mi perfil'],
  [`/${PrivateRoutes.LOGOUT}`, 'Cerrando sesión'],
  [`/${PrivateRoutes.NUEVO_USUARIO}`, 'Nuevo usuario'],
  [`/${RECEPCION}`, 'Panel de recepción'],
  [`/${RECEPCION}/agenda`, 'Agenda'],
  [`/${RECEPCION}/nuevo-turno`, 'Dar turno'],
  [`/${RECEPCION}/pacientes`, 'Pacientes'],
  [`/${RECEPCION}/copias-historia`, 'Copias de historia clínica'],
  [`/${ADMIN}`, 'Administración'],
  [`/${ADMIN}/profesionales`, 'Profesionales'],
  [`/${ADMIN}/horarios`, 'Horarios'],
  [`/${ADMIN}/especialidades`, 'Especialidades'],
  [`/${ADMIN}/obras-sociales`, 'Obras sociales'],
  [`/${ADMIN}/consultorios`, 'Consultorios'],
  [`/${ADMIN}/usuarios`, 'Usuarios'],
  [`/${ADMIN}/pantallas`, 'Pantallas de sala'],
  [`/${ADMIN}/auditoria`, 'Auditoría'],
  [`/${ADMIN}/configuracion`, 'Configuración'],
  [`/${MEDICO}`, 'Panel del médico'],
  [`/${MEDICO}/pacientes`, 'Mis pacientes'],
  [`/${MEDICO}/pacientes/:patientId`, 'Ficha del paciente'],
  [`/${MEDICO}/atencion/:appointmentId`, 'Atención médica'],
  [`/${MEDICO}/copias-historia`, 'Copias de historia clínica'],
];

/** <title> de la pantalla privada actual, según la ruta. Sin description ni Open Graph. */
export function PrivateTitle() {
  const { pathname } = useLocation();
  const found = privateTitles.find(([path]) => matchPath({ path, end: true }, pathname));
  return found ? <title>{found[1]}</title> : null;
}
