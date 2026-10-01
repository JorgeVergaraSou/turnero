/** Lo que devuelve GET /auth/profile (ProfileResponseDto del backend). */
export interface User {
    idUser: number;
    nickUsuario: string;
    nombre: string;
    apellido: string;
    email: string | null;
    role: string;
    /** ruta relativa al servidor (/uploads/avatars/<uuid>.ext), fuera del prefijo /api */
    fotoUrl: string | null;
    /** tiene configurada la verificación en dos pasos */
    twoFactorEnabled?: boolean;
  }
