// src/data-source.ts
/**
 * DataSource usado SOLO por el CLI de TypeORM (scripts migration:* del
 * package.json), no por la app — la app arma su conexión en AppModule con
 * las mismas opciones (buildDatabaseOptions). Acá hay que cargar el .env a
 * mano porque el CLI no pasa por ConfigModule.
 */
import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './config/database.config';

// La app se conecta con un usuario sin DDL (mínimo privilegio). Las migraciones
// necesitan CREATE/ALTER/TRIGGER: se pasan por variables del momento
// (MIGRATION_DB_USER / MIGRATION_DB_PASSWORD), sin guardarlas en el .env de la app.
export default new DataSource({
  ...buildDatabaseOptions({
    ...process.env,
    DB_USERNAME: process.env.MIGRATION_DB_USER || process.env.DB_USERNAME,
    DB_PASSWORD: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
  }),
  // la app usa autoLoadEntities; el CLI necesita encontrarlas por glob
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
});
