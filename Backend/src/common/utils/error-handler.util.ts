import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

interface MinimalLogger {
  error: (message: string, meta?: unknown) => void;
}

/**
 * Maneja errores internos de servicios de forma consistente: los loguea
 * con Winston (al logger propio del módulo que se le pase) y lanza la
 * excepción adecuada para que la maneje el filtro global de NestJS.
 *
 * `context` es opcional: información adicional (ids, parámetros, etc.)
 * que se agrega a la línea de log para facilitar el debug.
 *
 * Está tipada `never` — no hace falta `return` después de llamarla.
 */
export function handleServiceError(
  error: unknown,
  logger: MinimalLogger,
  serviceName: string,
  defaultMessage: string,
  context?: Record<string, unknown>,
): never {
  const contextoTexto = context
    ? ` | Contexto: ${JSON.stringify(context)}`
    : '';

  logger.error(
    `[${serviceName}] Error: ${error instanceof Error ? error.message : error}${contextoTexto}`,
    (error as any)?.stack || undefined,
  );

  // Si el error ya es una excepción de negocio (BadRequestException,
  // NotFoundException, UnauthorizedException, etc.), se relanza tal cual
  // en vez de envolverla en un 500 — permite lanzar esas excepciones desde
  // dentro de un try/catch sin que este helper las pise.
  if (error instanceof HttpException) {
    throw error;
  }

  if (error instanceof QueryFailedError) {
    // Entrada duplicada en una columna única (ej. dos registros
    // simultáneos con el mismo email, ganándole a la validación previa por
    // una condición de carrera) — 409, no 500: el cliente puede reintentar
    // con otro valor en vez de recibir un error genérico de servidor.
    if (
      (error as any).driverError?.code === 'ER_DUP_ENTRY' ||
      (error as any).driverError?.errno === 1062
    ) {
      throw new ConflictException('El valor ya está en uso');
    }
  }

  // Cualquier otro error (SQL, TypeORM o desconocido) sale con el mensaje
  // genérico del servicio. El detalle (nombres de tablas/columnas,
  // fragmentos de la query) queda solo en el log de arriba — nunca en la
  // respuesta HTTP: expondría la estructura de la base (y, en tablas
  // clínicas, potencialmente valores) a cualquier cliente. Antes se
  // devolvía `Error SQL: ${message}` / `Error de TypeORM: ...` tal cual.
  throw new InternalServerErrorException(defaultMessage);
}
