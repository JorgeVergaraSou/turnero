import { useEffect } from 'react';
import { publicApi } from '@/services';
import type { ClinicSettings } from '@/interfaces';
import { CLINIC_NAME } from '@/utilities';
import { useAsync } from './useAsync';

const CHANGED_EVENT = 'clinic-settings-changed';
let cached: Promise<ClinicSettings> | null = null;

/** Una sola petición compartida por toda la app (layouts, reserva, etc.). */
function loadClinicSettings(): Promise<ClinicSettings> {
  if (!cached) {
    cached = publicApi.settings().catch((error) => {
      cached = null; // que el próximo intento vuelva a pedirla
      throw error;
    });
  }
  return cached;
}

/** Llamar después de guardar la configuración: todos los que la usan se refrescan. */
export function notifyClinicSettingsChanged() {
  cached = null;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Configuración pública del consultorio (nombre, teléfono, reserva online,
 * horizonte, anticipación para cancelar). Mientras carga —o si falla—
 * `clinicName` cae al VITE_CLINIC_NAME del .env, así el encabezado nunca
 * queda vacío.
 */
export function useClinicSettings() {
  const { data, reload } = useAsync(() => loadClinicSettings(), []);

  useEffect(() => {
    window.addEventListener(CHANGED_EVENT, reload);
    return () => window.removeEventListener(CHANGED_EVENT, reload);
  }, [reload]);

  return { settings: data, clinicName: data?.clinicName ?? CLINIC_NAME };
}
