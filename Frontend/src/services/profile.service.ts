//src/services/profile.service.ts
/**
 * No recibe token como parámetro: el interceptor de axios (src/api/axios.ts)
 * lo agrega automáticamente en cada request desde localStorage.
 */
import { api } from "@/api/axios";

export const profileService = async () => {

  const res = await api.get('/auth/profile');

  return res.data;
};

export const updateUserService = async (
  idUser: number,
  data: Record<string, unknown>,
) => {

  const res = await api.patch(`/auth/updateUser/${idUser}`, data);

  return res.data;
};
