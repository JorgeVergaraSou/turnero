// src/config/database.config.ts
import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

interface DatabaseEnv {
  // admite process.env directo (el CLI de migraciones se lo pasa entero)
  [key: string]: string | number | undefined;
  DB_HOST?: string;
  DB_PORT?: string | number;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
}

/**
 * Opciones de conexión compartidas entre la app (AppModule) y el CLI de
 * migraciones (src/data-source.ts), para que timezone/dateStrings/etc. no
 * puedan divergir entre lo que corre la app y lo que genera una migración.
 *
 * `synchronize` queda SIEMPRE en false: el esquema cambia solo vía
 * migraciones (npm run migration:generate / migration:run). Con datos
 * clínicos, un synchronize que infiere un DROP COLUMN a partir de un
 * cambio en una entidad no es aceptable.
 */
export function buildDatabaseOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT) || 3306,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    synchronize: false,
    // join con '..' porque este archivo vive en src/config (o dist/config)
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    timezone: '-03:00',
    dateStrings: ['DATE'],
  };
}
