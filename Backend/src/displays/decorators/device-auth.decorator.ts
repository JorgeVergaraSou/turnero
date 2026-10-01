import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '@/auth/decorators/public.decorator';
import { DisplayTokenGuard } from '../display-token.guard';

export const DEVICE_AUTH_KEY = 'deviceAuth';

/**
 * Endpoint que NO usa sesión de usuario sino el token de una pantalla
 * (Authorization: Bearer dsp_…). Es @Public() para el AuthGuard global (que
 * solo entiende JWT de usuarios) y lo protege DisplayTokenGuard. Un JWT de
 * usuario, aunque sea de ADMIN, NO sirve acá, y un token de pantalla no
 * sirve en ningún otro endpoint.
 *
 * Límite de pedidos por IP (30/min): frena probar tokens y también un
 * televisor que reconecta en bucle.
 */
export const DeviceAuth = () =>
  applyDecorators(
    Public(),
    SetMetadata(DEVICE_AUTH_KEY, true),
    Throttle({ default: { limit: 30, ttl: 60000 } }),
    UseGuards(ThrottlerGuard, DisplayTokenGuard),
  );
