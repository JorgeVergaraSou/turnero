import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como accesible sin token para el AuthGuard global
 * (registrado como APP_GUARD en AppModule). Usar solo en los endpoints que
 * deben ser alcanzables antes de tener sesión (login, recuperación de
 * contraseña) — nunca "para que compile" o por comodidad. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
