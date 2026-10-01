// src/config/module-loggers.ts
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';

const timezoned = () =>
  moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');

/**
 * Cada módulo tiene su propio logger de errores, en su propio archivo con
 * rotación diaria (logs/errors-{modulo}-%DATE%.txt, retención 60 días).
 * Es complementario a winston.config.ts (error.log general, poblado por
 * AllExceptionsFilter) y a db-loggers.ts (auditoría técnica de inserts/
 * updates/deletes/selects) — no reemplaza a ninguno de los dos.
 */
function buildModuleErrorLogger(moduleName: string) {
  return winston.createLogger({
    level: 'error',
    transports: [
      new winston.transports.DailyRotateFile({
        filename: `logs/${moduleName}-errors-%DATE%.txt`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: '60d',
        format: winston.format.combine(
          winston.format.timestamp({ format: timezoned }),
          winston.format.printf(({ timestamp, message, ...meta }) => {
            const contexto =
              meta && Object.keys(meta).length > 0
                ? ` | ${JSON.stringify(meta)}`
                : '';
            return `${timestamp} [ERROR] ${message}${contexto}`;
          }),
        ),
      }),
    ],
  });
}

export const authErrorLogger = buildModuleErrorLogger('auth');
export const usersErrorLogger = buildModuleErrorLogger('users');
export const auditErrorLogger = buildModuleErrorLogger('audit');
export const specialtiesErrorLogger = buildModuleErrorLogger('specialties');
export const healthInsurancesErrorLogger =
  buildModuleErrorLogger('health-insurances');
export const officesErrorLogger = buildModuleErrorLogger('offices');
export const professionalsErrorLogger = buildModuleErrorLogger('professionals');
export const patientsErrorLogger = buildModuleErrorLogger('patients');
export const schedulingErrorLogger = buildModuleErrorLogger('scheduling');
export const appointmentsErrorLogger = buildModuleErrorLogger('appointments');
export const clinicalErrorLogger = buildModuleErrorLogger('clinical');
export const notificationsErrorLogger = buildModuleErrorLogger('notifications');
export const settingsErrorLogger = buildModuleErrorLogger('settings');
