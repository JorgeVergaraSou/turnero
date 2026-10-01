//src/services/auth.service.ts
import { jwtDecode } from "jwt-decode";
import { api } from "@/api/axios";
import { DecodedToken } from "@/interfaces/decode.token.interface";

/** Sesión lista para guardar en el store. */
export type Session = DecodedToken & { token: string };

/** Falta el 2.º paso: todavía NO hay sesión, solo un challenge de 10 min. */
export interface TwoFactorChallenge {
  twoFactor: 'setup' | 'verify';
  challengeToken: string;
}

const toSession = (token: string): Session => ({ token, ...jwtDecode<DecodedToken>(token) });

export const loginService = async (
  nickUsuario: string,
  password: string,
): Promise<Session | TwoFactorChallenge> => {
  const res = await api.post('/auth/login', { nickUsuario, password });
  if (res.data.twoFactor) return res.data as TwoFactorChallenge;
  return toSession(res.data.token);
};

// ---------- verificación en dos pasos ----------

/** Primera vez: genera el secreto; devuelve lo que va en el QR. */
export const twoFactorSetupService = async (challengeToken: string) =>
  (await api.post('/auth/2fa/setup', { challengeToken })).data as {
    otpauthUrl: string;
    secret: string;
  };

/** Primer código correcto: activa, abre la sesión y entrega los códigos de recuperación. */
export const twoFactorEnableService = async (challengeToken: string, code: string) => {
  const { token, recoveryCodes } = (await api.post('/auth/2fa/enable', { challengeToken, code })).data;
  return { session: toSession(token), recoveryCodes: recoveryCodes as string[] };
};

/** Ingresos siguientes: código de la app o de recuperación. */
export const twoFactorVerifyService = async (challengeToken: string, code: string) =>
  toSession((await api.post('/auth/2fa/verify', { challengeToken, code })).data.token);

/**
 * Anula la sesión en el servidor (si no, una copia del token seguiría
 * sirviendo hasta que venza). Si falla (sin red, ya vencida), igual se
 * cierra en el navegador: quien llama ignora el error.
 */
export const logoutService = async (): Promise<void> => {
  await api.post('/auth/logout');
};

/**
 * Pide el mail de recuperación. El backend responde igual exista o no el
 * usuario (no revela qué nicks existen). Si el usuario ya tiene un email
 * guardado, el mail va a ese y el `email` enviado acá se ignora.
 */
export const requestResetPasswordService = async (
  nickUsuario: string,
  email: string,
): Promise<void> => {
  await api.post('/auth/requestResetPassword', { nickUsuario, email });
};

/** Confirma la nueva clave con el token (uuid) que llegó por mail. */
export const resetPasswordService = async (
  password: string,
  resetPasswordToken: string,
): Promise<void> => {
  await api.post('/auth/resetPassword', { password, resetPasswordToken });
};
