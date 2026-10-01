/**
 * Infraestructura común de los e2e.
 *
 * Los e2e corren contra una base SEPARADA (`<DB_NAME>_e2e`, o E2E_DB_NAME
 * si está seteada), nunca contra la de desarrollo: generan pacientes,
 * turnos, consultas y auditoría, y los triggers append-only impiden
 * limpiarlos después. Por eso además cada test usa identificadores únicos
 * (nicks, DNIs, nombres) y no depende de datos previos.
 *
 * `prepareE2eDatabase()` tiene que llamarse ANTES de importar AppModule:
 * pisa process.env.DB_NAME, y ConfigModule no pisa variables ya seteadas.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import * as argon2 from 'argon2';
import request from 'supertest';
import { join } from 'path';
import { buildDatabaseOptions } from '../src/config/database.config';
import { Role } from '../src/common/enums/role.enum';
import { UserEntity } from '../src/users/entities/user.entity';
import { AllExceptionsFilter } from '../src/filters/http-exception.filter';

export const API = '/api';

export async function prepareE2eDatabase(): Promise<void> {
  const database =
    process.env.E2E_DB_NAME || `${process.env.DB_NAME ?? 'turnero'}_e2e`;
  process.env.DB_NAME = database;
  // los tests llaman a las tareas programadas a mano, sin depender del reloj
  process.env.DISABLE_SCHEDULED_JOBS = 'true';

  // Crear la base y migrar requiere DDL: si la app usa un usuario de mínimo
  // privilegio, pasar MIGRATION_DB_USER / MIGRATION_DB_PASSWORD al correr los e2e.
  const ddlUser = process.env.MIGRATION_DB_USER || process.env.DB_USERNAME;
  const ddlPassword =
    process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: ddlUser,
    password: ddlPassword,
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await connection.end();

  const dataSource = new DataSource({
    ...buildDatabaseOptions({
      ...process.env,
      DB_USERNAME: ddlUser,
      DB_PASSWORD: ddlPassword,
    }),
    entities: [join(__dirname, '..', 'src', '**', '*.entity.ts')],
    migrations: [join(__dirname, '..', 'src', 'migrations', '*.ts')],
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

/** Levanta la app igual que main.ts (prefijo, pipes, filtro de errores). */
export async function createE2eApp(): Promise<INestApplication> {
  // import diferido: AppModule tiene que cargarse DESPUÉS de fijar DB_NAME
  // (con module node16 un import() relativo exigiría extensión .js — ver CLAUDE.md)
  const { AppModule } =
    jest.requireActual<typeof import('../src/app.module')>('../src/app.module');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter({ error: () => {} } as any));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

let sequence = 0;
/** Sufijo único por corrida + contador, para no chocar con datos previos. */
export function unique(prefix = ''): string {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}`.slice(-24);
}

/** DNI único (solo dígitos, 8–11 caracteres). */
export function uniqueDni(): string {
  sequence += 1;
  return `${Date.now() % 1e8}${sequence}`.slice(0, 11);
}

/** Crea un usuario directo en la base y devuelve su token de login real. */
export async function createUserAndLogin(
  app: INestApplication,
  role: Role,
): Promise<{ userId: number; token: string }> {
  const dataSource = app.get(DataSource);
  const nickUsuario = unique(role.toLowerCase().slice(0, 4) + '-');
  const password = 'Passw0rd-e2e';
  const saved = await dataSource.getRepository(UserEntity).save({
    nickUsuario,
    nombre: 'E2E',
    apellido: role,
    password: await argon2.hash(password),
    role,
  });
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({ nickUsuario, password })
    .expect(200);
  return { userId: saved.idUser, token: res.body.token };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
