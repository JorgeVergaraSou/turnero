import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  LoggerService,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {} // Cambiamos el tipo a LoggerService

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const clientError = asClientError(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (clientError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const message =
      exception instanceof HttpException
        ? typeof exception.getResponse() === 'object'
          ? (exception.getResponse() as any).message
          : exception.getResponse()
        : (clientError?.message ?? 'Error interno');

    this.logger.error(
      `HTTP ${status} Error en ${request.method} ${request.url}: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : '',
    );

    // NOTA: no se manda el stack trace en la respuesta (solo queda en el
    // log de arriba) — este proyecto no setea NODE_ENV en ningún lado, así
    // que un chequeo tipo `NODE_ENV !== 'production'` trataría cualquier
    // deploy real como desarrollo y filtraría el stack trace a usuarios
    // reales. Si en algún momento se define NODE_ENV de forma confiable en
    // todos los entornos, ahí sí tiene sentido condicionar esto.
    response.status(status).json({
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

/**
 * Errores 4xx que no son de Nest sino de los middlewares de Express
 * (body-parser: cuerpo demasiado grande → 413, JSON mal formado → 400).
 * Siguen la convención de http-errors: `expose: true` indica que el
 * mensaje es seguro para el cliente. Sin esto, un cuerpo gigante
 * respondía "500 Error interno" en vez de 413.
 */
const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: 'El cuerpo del pedido no es JSON válido.',
  413: 'El pedido es demasiado grande.',
  415: 'Formato de contenido no soportado.',
};

function asClientError(
  exception: unknown,
): { status: number; message: string } | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { status, expose } = exception as {
    status?: unknown;
    expose?: unknown;
  };
  if (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  ) {
    return {
      status,
      message: CLIENT_ERROR_MESSAGES[status] ?? 'Pedido inválido.',
    };
  }
  return null;
}
