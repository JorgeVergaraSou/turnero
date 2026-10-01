import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const ActiveUser = createParamDecorator(
  /** recive una funcion flecha */
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
/**
 * este código es un decorador de parámetros personalizado en NestJS llamado ActiveUser.
 * Los decoradores de parámetros son funciones que se aplican a los parámetros de un controlador de NestJS y
 * se utilizan para personalizar el manejo de esos parámetros. Veamos qué hace este decorador:
 */
/**
 * import { ExecutionContext, createParamDecorator } from "@nestjs/common";: Importa las clases 
 * ExecutionContext y createParamDecorator de NestJS. Estas clases se utilizan para crear decoradores 
 * de parámetros personalizados.

export const ActiveUser = createParamDecorator(...);: Declara y exporta un decorador de parámetros llamado 
ActiveUser. Este decorador se puede usar para extraer el usuario activo de una solicitud HTTP en un 
controlador de NestJS.

(data: unknown, ctx: ExecutionContext) => { ... }: Esta es una función flecha que toma 
dos parámetros: data (que se desconoce y no se utiliza en esta implementación) y 
ctx (que es una instancia de ExecutionContext). ExecutionContext proporciona información sobre el 
contexto de ejecución actual, como la solicitud HTTP, el método controlador y otros detalles relevantes.

const request = ctx.switchToHttp().getRequest();: Dentro de la función, se utiliza ctx para obtener 
la solicitud HTTP actual mediante ctx.switchToHttp().getRequest(). Esto es posible porque ExecutionContext
 proporciona métodos para cambiar al contexto HTTP en un entorno de servidor HTTP.

return request.user;: Finalmente, el decorador devuelve request.user, que se espera que sea el usuario 
activo asociado con la solicitud HTTP. Esto podría haber sido establecido previamente por un middleware 
de autenticación o alguna otra lógica de procesamiento de solicitudes.

En resumen, este decorador de parámetros ActiveUser proporciona una forma conveniente de acceder al 
usuario activo asociado con una solicitud HTTP dentro de un controlador de NestJS, facilitando así 
la manipulación y la implementación de lógica de autorización o autenticación.
 */
