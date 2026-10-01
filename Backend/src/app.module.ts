//src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { DisplaysModule } from './displays/displays.module';
import { HealthInsurancesModule } from './health-insurances/health-insurances.module';
import { OfficesModule } from './offices/offices.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClinicalModule } from './clinical/clinical.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthGuard } from './auth/guard/auth.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './config/winston.config';
import { buildDatabaseOptions } from './config/database.config';
import { AppService } from './app.service';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Esto hace que la configuración esté disponible en todo el proyecto
      // Si falta o está vacía alguna de estas variables, la app no arranca
      // — mejor eso que arrancar "silenciosamente" con un JWT firmado con
      // secreto undefined, o intentar conectar a una base sin credenciales.
      validationSchema: Joi.object({
        DB_TYPE: Joi.string().default('mysql'),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(3306),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().allow('').required(),
        DB_NAME: Joi.string().required(),
        SECRET_WORD: Joi.string().min(16).required(),
        MAIL_HOST: Joi.string().default('smtp.gmail.com'),
        MAIL_PORT: Joi.number().default(465),
        MAIL_USER: Joi.string().allow('').optional(),
        MAIL_PASSWORD: Joi.string().allow('').optional(),
        MAIL_FROM_NAME: Joi.string().allow('').optional(),
        FRONTEND_URL: Joi.string().uri().optional(),
        CORS_ORIGIN: Joi.string().allow('').optional(),
        TRUST_PROXY: Joi.string().allow('').optional(),
        DISABLE_SCHEDULED_JOBS: Joi.string()
          .valid('true', 'false', '')
          .optional(),
        PORT: Joi.number().default(3006),
        SEED_ADMIN_NICK: Joi.string().allow('').optional(),
        SEED_ADMIN_EMAIL: Joi.string().allow('').optional(),
        SEED_ADMIN_PASSWORD: Joi.string().allow('').optional(),
      }),
      validationOptions: {
        abortEarly: false, // reporta todas las variables faltantes juntas, no solo la primera
      },
    }),
    // Registrar WinstonModule globalmente con tu configuración
    WinstonModule.forRoot(winstonConfig),

    // Límite base para las rutas que usen @Throttle() (hoy: login y
    // requestResetPassword en auth/). No aplica solo, cada ruta lo activa
    // con @UseGuards(ThrottlerGuard).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 20 }],
      errorMessage:
        'Demasiados intentos. Esperá un momento antes de volver a intentar.',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // 🔍 Log para verificar que las variables se leen bien (sin exponer la
        // contraseña en la consola / archivos de log)
        console.log({
          type: configService.get('DB_TYPE'),
          host: configService.get('DB_HOST'),
          port: configService.get('DB_PORT'),
          username: configService.get('DB_USERNAME'),
          database: configService.get('DB_NAME'),
        });

        // Mismas opciones que el CLI de migraciones (src/data-source.ts).
        // synchronize:false — el esquema cambia solo vía migraciones.
        return {
          ...buildDatabaseOptions({
            DB_HOST: configService.get<string>('DB_HOST'),
            DB_PORT: configService.get<string>('DB_PORT'),
            DB_USERNAME: configService.get<string>('DB_USERNAME'),
            DB_PASSWORD: configService.get<string>('DB_PASSWORD'),
            DB_NAME: configService.get<string>('DB_NAME'),
          }),
          autoLoadEntities: true,
        };
      },
      inject: [ConfigService],
    }),
    // eventos de dominio (turnos → notificaciones), ver appointment.events.ts
    EventEmitterModule.forRoot(),
    // tareas programadas (recordatorios de turno), ver appointment-reminders.scheduler.ts
    ScheduleModule.forRoot(),
    AuthModule,
    AuditModule,
    SettingsModule,
    SpecialtiesModule,
    HealthInsurancesModule,
    OfficesModule,
    ProfessionalsModule,
    SchedulingModule,
    PatientsModule,
    AppointmentsModule,
    NotificationsModule,
    ClinicalModule,
    DisplaysModule,
  ],
  controllers: [],
  providers: [
    AppService,
    // "Cerrado por defecto": todo endpoint exige token salvo que esté
    // marcado @Public(). Un controller nuevo que se olvide de @Auth() queda
    // cerrado en vez de abierto. La restricción por ROL sigue siendo
    // explícita con @Auth(...roles) — RolesGuard no es global.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
