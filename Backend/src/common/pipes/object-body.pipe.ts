import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/**
 * Pipe global: si un endpoint espera un cuerpo con forma de objeto (un DTO) y
 * llega una lista (`[]`), se rechaza con 400. Sin esto, la lista pasaba la
 * validación (class-transformer devuelve una lista vacía) y llegaba a los
 * servicios, que esperan un objeto: PATCH /admin/settings y
 * PATCH /auth/editar-usuario/:id respondían 500. Los endpoints que de verdad
 * reciben una lista declaran `Array` como tipo y no se ven afectados.
 */
@Injectable()
export class ObjectBodyPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (
      metadata.type === 'body' &&
      Array.isArray(value) &&
      metadata.metatype &&
      metadata.metatype !== Array
    ) {
      throw new BadRequestException(
        'El cuerpo del pedido tiene que ser un objeto.',
      );
    }
    return value;
  }
}
