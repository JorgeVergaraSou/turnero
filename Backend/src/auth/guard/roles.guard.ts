import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
//import { Observable } from 'rxjs';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '@/common/enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  /** reflecor: nos va permitir leer el rol */
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /** La función getAllAndOverride del Reflector se utiliza para obtener los metadatos de un controlador 
     * o controlador de método, pero con la capacidad de sobrescribir esos metadatos si existen en varios 
     * niveles de la jerarquía.

El método getAllAndOverride toma dos argumentos:

metadataKey: Este es el nombre de la clave bajo la cual se almacenan los metadatos en el controlador o 
controlador de método. En este caso, metadataKey es 'roles'.

metatype: Este es un arreglo que contiene los elementos de los cuales se obtendrán los metadatos.
 En este caso, se pasa un arreglo con dos elementos:

  context.getHandler(): da como resultado la extracción de los metadatos para el controlador de ruta
    procesado actualmente.
  context.getClass(): metadatos del controlador de clase.
La función getAllAndOverride buscará los metadatos en el primer elemento del arreglo (context.getHandler(),
 que representa los metadatos del controlador de método) y si no los encuentra, 
 buscará en el segundo elemento (context.getClass(), que representa los metadatos del controlador de clase). 
 Si encuentra metadatos en cualquiera de estos elementos, los devolverá y los almacenará en la variable 
 requiredRoles. */
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    /** si no existen roles, retorna true */
    if (!roles || roles.length === 0) {
      return true;
    }
    /** con esto accedemos al request del usuario para obtener el tipo de rol */
    const { user } = context.switchToHttp().getRequest();

    /** si es admin puede pasar a todo lo habilitado */
    if (user.role === Role.ADMIN) {
      return true;
    }

    // @Roles(...roles) guarda un ARRAY (ver roles.decorator.ts) — hay que
    // comprobar pertenencia, no igualdad directa contra el array.
    return roles.includes(user.role);
  }
}
/** para crear este guard usamos: $ nest g guard auth/guard/roles --flat */
/** Reflector y Guard#
Para acceder a los metadatos establecidos con el decorador SetMetadata en el controlador o sus métodos, 
puedes hacer uso del módulo Reflector proporcionado por Nest.js.
El Reflector te permitirá leer los metadatos adjuntados a los controladores o 
controladores de métodos en tiempo de ejecución. */
