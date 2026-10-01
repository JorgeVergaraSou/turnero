import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * El ThrottlerGuard por defecto cuenta intentos por IP sola — en una red
 * compartida (una oficina entera saliendo por la misma IP), los intentos
 * fallidos de una persona bloquearían el login de cualquier otra persona de
 * esa red.
 *
 * Acá el contador combina IP + nickUsuario: compañeros de red no se
 * bloquean entre sí por errores ajenos, pero sigue frenando la fuerza bruta
 * contra UNA cuenta puntual. Ver la nota de `trust proxy` en CLAUDE.md:
 * detrás de un reverse proxy, req.ip sería la IP del proxy.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const nickUsuario =
      typeof req.body?.nickUsuario === 'string' && req.body.nickUsuario.trim()
        ? req.body.nickUsuario.trim().toLowerCase()
        : 'sin-usuario';
    return `${req.ip}-${nickUsuario}`;
  }
}
