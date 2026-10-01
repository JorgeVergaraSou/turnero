import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Actor } from '@/common/interfaces/actor.interface';

/**
 * Trae el "actor" de la request (usuario autenticado + IP) para pasárselo
 * a los services que auditan. En endpoints @Public() `userId` es null.
 * Ver la nota de `trust proxy` en CLAUDE.md: detrás de un reverse proxy,
 * `ip` sería la del proxy.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest();
    return {
      userId: request.user?.idUser ?? null,
      ip: request.ip ?? null,
    };
  },
);
