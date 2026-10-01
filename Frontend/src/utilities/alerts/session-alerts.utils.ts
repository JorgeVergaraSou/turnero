// src/utilities/alerts/session-alerts.utils.ts
/**
 * Alertas relacionadas a la sesión/token, usadas por el interceptor de
 * axios (src/api/axios.ts). Separadas de alert.utils.ts (genérico) para
 * que cada proyecto agregue sus propias alertas de negocio en un archivo
 * aparte sin tocar este.
 */
import { showError } from "./alert.utils";

export const sesionVencidaAlert = () =>
  showError(
    "Tu sesión venció o ya no es válida. Volvé a iniciar sesión.",
    "Sesión vencida",
  );

export const servidorNoDisponibleAlert = () =>
  showError(
    "No se pudo conectar con el servidor. Vas a ser redirigido al login.",
    "Servidor no disponible",
  );
