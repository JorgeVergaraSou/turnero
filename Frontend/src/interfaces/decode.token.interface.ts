/** Payload del JWT que firma el backend en /auth/login. */
export interface DecodedToken {
  idUser: number;
  nickUsuario: string;
  name: string;
  role: string;
  exp: number;
  iat: number;
}
