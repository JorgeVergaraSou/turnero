// src/config/db-loggers.ts
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';

const timezoned = () =>
  moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');

function buildLogger(baseFilename: string, label: string) {
  return winston.createLogger({
    level: 'info',
    transports: [
      new winston.transports.DailyRotateFile({
        filename: `logs/${baseFilename}-%DATE%.txt`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: '60d',
        format: winston.format.combine(
          winston.format.label({ label }),
          winston.format.timestamp({ format: timezoned }),
          winston.format.printf(({ timestamp, label, message }) => {
            return `${timestamp} [${label}] ${message}`;
          }),
        ),
      }),
    ],
  });
}

// Exportar loggers específicos
export const insertLogger = buildLogger('inserts', 'INSERT');
export const updateLogger = buildLogger('updates', 'UPDATE');
export const deleteLogger = buildLogger('deletes', 'DELETE');
export const selectLogger = buildLogger('selects', 'SELECT');
/**
 * Ejemplo al hacer operaciones con un repositorio TypeORM o servicio:

ts
Copiar
Editar
import {
  insertLogger,
  updateLogger,
  deleteLogger,
} from '@/config/db-loggers';

// INSERT
await this.repository.save(nuevoRegistro);
insertLogger.info(`Nuevo registro creado: ${JSON.stringify(nuevoRegistro)}`);

// UPDATE
await this.repository.update(id, datosActualizados);
updateLogger.info(`Registro actualizado (ID ${id}): ${JSON.stringify(datosActualizados)}`);

// DELETE
await this.repository.delete(id);
deleteLogger.info(`Registro eliminado (ID ${id})`);

 */
