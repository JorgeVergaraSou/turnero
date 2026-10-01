//src/api/axios.ts
import axios from 'axios';
import { apiUrl } from '@/utilities';
import { UserKey } from '@/redux/states/user';
import { PublicRoutes } from '@/models';
import { servidorNoDisponibleAlert, sesionVencidaAlert } from '@/utilities/alerts/session-alerts.utils';

export const api = axios.create({
  baseURL: apiUrl,
});

/**
 * Evitan disparar varias alertas/redirecciones a la vez: cuando el token
 * vence o el servidor cae, normalmente hay varios requests en paralelo
 * (varios componentes pidiendo datos) que fallan casi al mismo tiempo.
 * Solo el primero muestra el aviso y redirige; el resto se ignora.
 */
let avisandoServidorCaido = false;
let avisandoSesionVencida = false;

api.interceptors.request.use(
  (config) => {
    const userStorage = localStorage.getItem(UserKey);

    if (userStorage) {
      const user = JSON.parse(userStorage);

      if (user.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,

  (error) => {

    const enLogin = window.location.pathname.startsWith(`/${PublicRoutes.LOGIN}`);

    // Un 401 del PROPIO pedido de login significa "usuario o contraseña
    // inválidos" (la pantalla de Login muestra ese mensaje) — no es una
    // sesión vencida: no se limpia nada ni se redirige.
    const esPedidoDeLogin = error.config?.url?.includes('/auth/login');

    // Solo hay sesión que cerrar si había un usuario del personal logueado.
    // Un paciente en el flujo público (reserva, consulta de turno) no tiene
    // sesión: si el servidor no responde, ve el error en la propia página —
    // mandarlo al login del personal no tendría sentido.
    const teniaSesion = !!localStorage.getItem(UserKey);

    if (error.response?.status === 401 && !esPedidoDeLogin && teniaSesion) {

      localStorage.removeItem(UserKey);

      if (!avisandoSesionVencida && !enLogin) {
        avisandoSesionVencida = true;

        sesionVencidaAlert().then(() => {
          window.location.href = `/${PublicRoutes.LOGIN}`;
        });
      }

    } else if (!error.response && teniaSesion) {

      // No hubo respuesta del servidor: caído, sin red, o similar
      // (ej. ERR_CONNECTION_REFUSED). Se cierra la sesión igual que en
      // un 401, para forzar un login nuevo cuando el servidor vuelva.
      if (!avisandoServidorCaido && !enLogin) {
        avisandoServidorCaido = true;

        localStorage.removeItem(UserKey);

        servidorNoDisponibleAlert().then(() => {
          window.location.href = `/${PublicRoutes.LOGIN}`;
        });
      }
    }

    // El backend responde { success:false, message } y, en errores de
    // validación, message es un array — se unen en un solo texto.
    const data = error.response?.data?.message;
    const message =
      (Array.isArray(data) ? data.join('. ') : data) ||
      (!error.response ? 'No se pudo conectar con el servidor' : 'Error desconocido');

    return Promise.reject(
      new Error(message),
    );
  },
);
