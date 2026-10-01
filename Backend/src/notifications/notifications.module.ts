import { Module } from '@nestjs/common';
import { AppointmentEmailListener } from './appointment-email.listener';

/** Canales de aviso al paciente, desacoplados de los turnos vía eventos. */
@Module({
  providers: [AppointmentEmailListener],
})
export class NotificationsModule {}
