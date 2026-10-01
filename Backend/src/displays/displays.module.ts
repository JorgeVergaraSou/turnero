import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayDeviceEntity } from './entities/display-device.entity';
import { DisplayDevicesService } from './display-devices.service';
import { DisplayStreamService } from './display-stream.service';
import { DisplayTokenGuard } from './display-token.guard';
import {
  AdminDisplayDevicesController,
  DisplayStreamController,
} from './displays.controller';

/**
 * Pantallas de sala de espera: administración de dispositivos (token
 * propio, hash en la base) y el stream SSE de llamados. Escucha
 * `appointment.called` (ver appointment.events.ts); no depende de turnos
 * ni de la parte clínica.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DisplayDeviceEntity])],
  controllers: [AdminDisplayDevicesController, DisplayStreamController],
  providers: [DisplayDevicesService, DisplayStreamService, DisplayTokenGuard],
})
export class DisplaysModule {}
