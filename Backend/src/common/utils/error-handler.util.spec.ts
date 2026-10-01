import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { handleServiceError } from './error-handler.util';

describe('handleServiceError', () => {
  const logger = { error: jest.fn() };

  beforeEach(() => {
    logger.error.mockClear();
  });

  it('relanza una HttpException de negocio tal cual, sin envolverla', () => {
    const original = new BadRequestException('Ya existe');

    expect(() =>
      handleServiceError(original, logger, 'Servicio.metodo', 'default'),
    ).toThrow(original);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('convierte un error de entrada duplicada (ER_DUP_ENTRY) en ConflictException', () => {
    const dupError = new QueryFailedError('INSERT ...', [], {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      message: "Duplicate entry 'x' for key 'email'",
    } as any);

    expect(() =>
      handleServiceError(dupError, logger, 'Servicio.metodo', 'default'),
    ).toThrow(ConflictException);
  });

  it('otros QueryFailedError caen en InternalServerErrorException con el mensaje genérico, sin filtrar el detalle SQL', () => {
    const sqlError = new QueryFailedError('SELECT secreto FROM pacientes', [], {
      code: 'ER_BAD_FIELD_ERROR',
      message: "Unknown column 'secreto' in 'field list'",
    } as any);

    try {
      handleServiceError(
        sqlError,
        logger,
        'Servicio.metodo',
        'Mensaje genérico',
      );
      fail('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerErrorException);
      const message = (error as InternalServerErrorException).message;
      expect(message).toBe('Mensaje genérico');
      expect(message).not.toContain('secreto');
    }
    // el detalle sí queda en el log server-side
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown column'),
      expect.anything(),
    );
  });

  it('un error desconocido cae en InternalServerErrorException con el mensaje por defecto', () => {
    try {
      handleServiceError(
        new Error('boom'),
        logger,
        'Servicio.metodo',
        'Mensaje por defecto',
      );
      fail('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as InternalServerErrorException).message).toBe(
        'Mensaje por defecto',
      );
    }
  });

  it('agrega el context a la línea de log cuando se pasa', () => {
    try {
      handleServiceError(
        new Error('boom'),
        logger,
        'Servicio.metodo',
        'default',
        { id: 42 },
      );
    } catch {
      // no interesa la excepción acá, solo el log
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('"id":42'),
      expect.anything(),
    );
  });
});
