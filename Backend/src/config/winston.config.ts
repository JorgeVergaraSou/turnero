// src/config/winston.config.ts
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';

const timezoned = () =>
  moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');

export const winstonConfig = {
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Colorea la salida en la consola
        winston.format.timestamp({
          format: timezoned,
        }), // Añade timestamp a cada log
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        }),
      ),
    }),

    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '60d',
      format: winston.format.combine(
        winston.format.timestamp({ format: timezoned }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}] ${message}`;
        }),
      ),
    }),
  ],
};
