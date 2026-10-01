import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicSettingsEntity } from './entities/clinic-settings.entity';
import { SettingsService } from './settings.service';
import {
  AdminSettingsController,
  PublicSettingsController,
} from './settings.controller';

/** Global: turnos, disponibilidad y notificaciones leen la configuración. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ClinicSettingsEntity])],
  controllers: [PublicSettingsController, AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
