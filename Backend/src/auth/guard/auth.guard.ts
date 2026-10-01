import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
/** se llama al metodo AuthGuard si todo esta bien deja pasar a la sigueinte solicitud desde donde lo llaman */
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Este guard corre global (APP_GUARD en AppModule): todo endpoint exige
    // token salvo que esté marcado @Public(). Ver public.decorator.ts.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    /** llamamos a lla funcion que extrae el token para chequear si esta vacio */
    const token = this.extractTokenFromHeader(request);

    /** si el token esta vacio enviamos un error y no se continua ejecutando
     * el codigo
     */
    if (!token) {
      throw new UnauthorizedException();
    }
    /** si existe TOKEN */

    try {
      /** esto verifica que el token sea el mismo de la palabra secreta si no es igual pasa al CATCH */
      const secretWord = this.configService.get<string>('SECRET_WORD');
      const payload = await this.jwtService.verifyAsync(token, {
        secret: secretWord,
      });

      // rechaza tokens de usuarios dados de baja (soft-delete): findOneById
      // excluye soft-deleted por defecto (TypeORM), así que un usuario
      // inexistente o desactivado devuelve null acá, aunque su JWT
      // (emitido antes de la baja) todavía no haya expirado.
      const user = await this.usersService.findOneById(payload.idUser);

      if (!user) {
        throw new UnauthorizedException();
      }

      // un challenge de verificación en dos pasos no es una sesión
      if (payload.purpose) {
        throw new UnauthorizedException();
      }

      // sesión cerrada (logout): el token sigue firmado pero ya no vale
      if (
        payload.jti &&
        (await this.usersService.isTokenRevoked(payload.jti))
      ) {
        throw new UnauthorizedException();
      }

      // token emitido antes del último cambio de clave: ya no vale (una
      // sesión robada muere cuando el dueño cambia la contraseña o el admin
      // se la restablece). iat va en segundos; la base guarda segundos.
      if (
        user.passwordChangedAt &&
        typeof payload.iat === 'number' &&
        payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
      ) {
        throw new UnauthorizedException();
      }

      // request.user se arma con los datos ACTUALES de la base, no con los
      // del payload: el JWT dura 3h, y si en ese lapso a alguien le cambian
      // el rol (ej. un MEDICO pasa a RECEPCIONISTA), con el rol del token
      // seguiría accediendo a información clínica hasta que expire. El
      // usuario ya se buscó arriba para validar que siga activo, así que
      // no cuesta una query extra.
      request.user = {
        ...payload,
        idUser: user.idUser,
        nickUsuario: user.nickUsuario,
        role: user.role,
      };
    } catch (error) {
      // usersService.findOneById puede fallar por un motivo ajeno al token
      // (ej. la base caída) y ya llega acá como una HttpException real
      // (500) vía handleServiceError — si la pisáramos con un 401 genérico,
      // cualquier blip de infraestructura se vería como "sesión inválida"
      // para todo el mundo (un frontend que trata 401 como "deslogueate"
      // desloguearía a usuarios con tokens perfectamente válidos) y
      // escondería el error real de los logs/monitoreo que miran status
      // codes. Solo los errores de verificación del JWT en sí (firma
      // inválida, expirado, malformado — todos objetos planos, no
      // HttpException) y el `throw new UnauthorizedException()` de arriba
      // (usuario no encontrado/dado de baja) se normalizan a 401 acá.
      if (
        error instanceof HttpException &&
        !(error instanceof UnauthorizedException)
      ) {
        throw error;
      }
      throw new UnauthorizedException();
    }
    /** no es necesario hacer return false, porque los 2 throw new se encargan de detener la ejecucion */
    return true;
  }
  /** Esta es una función privada llamada extractTokenFromHeader que toma un objeto Request como argumento
   * y devuelve una cadena (string) o undefined. */
  private extractTokenFromHeader(request: Request): string | undefined {
    /** Aquí, se desestructura la cabecera Authorization de la solicitud HTTP. Se asume que la cabecera de 
     * autorización está en el formato "Bearer token", donde "Bearer" es el tipo de token y 
     * "token" es el token real.
Se utiliza el operador de encadenamiento opcional (?.) para manejar el caso en que la cabecera de 
autorización no esté presente en la solicitud. Si la cabecera de autorización no está presente, 
la expresión se evalúa como undefined.
La función split(' ') divide la cadena de la cabecera de autorización en dos partes:
 el tipo de token y el token real.
Si la cabecera de autorización no está presente o no tiene un formato válido, 
se establece type y token en un arreglo vacío. */
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    /** Finalmente, se verifica si type es igual a "Bearer". Si es así, se devuelve token,
     * que contiene el token real. De lo contrario, se devuelve undefined,
     * lo que indica que no se encontró un token válido en la cabecera de autorización. */
    return type === 'Bearer' ? token : undefined;
  }
}
/** canActive#
El método canActivate es uno de los métodos principales que un guard puede implementar. 
Este método se ejecuta antes de que se procese una solicitud hacia una ruta o endpoint específico. 
La función canActivate devuelve un valor booleano o una promesa que resuelve a un valor booleano. 
Dependiendo del resultado de esta función, se permitirá o se denegará el acceso al endpoint protegido.
Si el método canActivate devuelve true, 
la solicitud se permite y continúa el flujo normal hacia el controlador asociado con la ruta.
Si el método canActivate devuelve false, se niega el acceso a la ruta protegida y la solicitud se detiene. 
En este caso, el guard puede tomar acciones como redirigir a una página de inicio de sesión o 
enviar una respuesta de error, según el caso.  */
