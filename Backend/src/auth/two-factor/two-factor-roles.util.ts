import { Role } from '@/common/enums/role.enum';

/**
 * Roles guardados como 'ADMIN,MEDICO' en clinic_settings. En un archivo
 * propio, sin servicios: SettingsService lo usa y TwoFactorService usa
 * SettingsService; tenerlo dentro de two-factor.service creaba un ciclo de
 * imports (SettingsService llegaba undefined según el orden de carga).
 */
export function parseRoles(value: string | null | undefined): Role[] {
  return (value ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is Role => (Object.values(Role) as string[]).includes(r));
}
