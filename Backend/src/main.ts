// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { winstonConfig } from './config/winston.config';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  // Usamos la configuración completa de Winston
  const winstonLogger = WinstonModule.createLogger(winstonConfig);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger, // Logger global de NestJS
  });

  // Configura el filtro global de excepciones con el logger de Winston
  app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));

  // Headers de seguridad básicos (oculta X-Powered-By, agrega
  // X-Content-Type-Options, etc.). No configuramos una CSP acá porque esta
  // app es una API pura (sin vistas HTML propias) — si algún proyecto hijo
  // de esta base sirve HTML, ahí sí conviene revisar la CSP por default.
  // crossOriginResourcePolicy en 'cross-origin': sin esto, el frontend (en
  // otro origen/puerto) no puede ni mostrar un <img src> apuntando a
  // /uploads — el default 'same-origin' de helmet lo bloquea en el browser.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Fotos de perfil servidas como estático, ANTES del prefijo global — la
  // URL resultante (/uploads/avatars/<uuid>.ext) no lleva /api.
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // CORS cerrado por defecto: CORS_ORIGIN (lista separada por comas) y, si
  // no está, solo FRONTEND_URL (default http://localhost:5173). Antes, sin
  // CORS_ORIGIN quedaba abierto a '*' — con datos clínicos, cualquier sitio
  // podría haber llamado a la API desde el navegador de alguien logueado.
  // Sin credentials:true: el frontend autentica con Authorization: Bearer.
  const corsOrigin = (
    process.env.CORS_ORIGIN ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Detrás de un reverse proxy / balanceador, req.ip sería la del proxy
  // para todos los clientes: el rate limiting los contaría como uno solo y
  // la auditoría registraría la IP equivocada. TRUST_PROXY lo habilita de
  // forma explícita (nunca por defecto: sin proxy real, confiar en
  // X-Forwarded-For permitiría falsear la IP). Valores: 'true', un número
  // de saltos (ej. '1') o IPs/subredes separadas por coma.
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT || 3006);
}
bootstrap();

function parseTrustProxy(
  value?: string,
): boolean | number | string | undefined {
  if (!value || value === 'false') return undefined;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
