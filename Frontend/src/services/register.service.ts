//src/services/register.service.ts
import { api } from "@/api/axios";
import { Roles } from "@/models";

export interface NuevoUsuarioData {
  nickUsuario: string;
  nombre: string;
  apellido: string;
  password: string;
  role: Roles;
  email: string;
}

/**
 * Alta de usuario — solo ADMIN (el backend lo exige con @Auth(Role.ADMIN)).
 * No hay registro público. El email es obligatorio (recuperación de clave).
 */
export const registerService = async (data: NuevoUsuarioData): Promise<void> => {

  await api.post('/auth/nuevo-usuario', data);
};
