import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DisplayDevicesService } from './display-devices.service';
import { DISPLAY_TOKEN_PATTERN } from './display-token.util';

/** Pantalla ya autenticada, colgada de la request. */
export interface DisplayDeviceContext {
  id: number;
  name: string;
}

@Injectable()
export class DisplayTokenGuard implements CanActivate {
  constructor(private readonly devices: DisplayDevicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: unknown = request.headers?.authorization;
    const match =
      typeof header === 'string' ? /^Bearer (\S+)$/.exec(header) : null;
    // misma respuesta (401 sin detalle) para "sin token", "con formato
    // inválido", "inexistente" y "desactivada": no se revela cuál fue
    if (!match || !DISPLAY_TOKEN_PATTERN.test(match[1])) {
      throw new UnauthorizedException();
    }
    const device = await this.devices.findActiveByToken(match[1]);
    if (!device) throw new UnauthorizedException();
    request.displayDevice = {
      id: device.id,
      name: device.name,
    } satisfies DisplayDeviceContext;
    return true;
  }
}
