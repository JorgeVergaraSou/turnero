import { SetMetadata } from '@nestjs/common';
import { Role } from '@/common/enums/role.enum';

export const ROLES_KEY = 'roles';
/** el decorador funcionara con el metadata, nos permite agregar informacion al request */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** SetMetadata#
El decorador SetMetadata en Nest.js se utiliza para asignar metadatos personalizados a los controladores, 
controladores de métodos o parámetros de un método. 
Los metadatos son información adicional que puedes adjuntar a estos elementos para usarlos 
en diversos propósitos, como la configuración de autorización, validación, serialización, etc. */

/** Recibe 2 valores
 * key: Es el nombre de la clave bajo la cual se almacenarán los metadatos. Puedes elegir 
 * cualquier string como clave para identificar los metadatos.
value: Es el valor que deseas asignar a la clave como metadato. Puede ser cualquier 
tipo de dato válido en TypeScript (números, strings, objetos, etc.).
 */
