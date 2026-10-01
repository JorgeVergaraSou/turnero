import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatusHistoryEntity } from './entities/appointment-status-history.entity';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { AppointmentRemindersScheduler } from './appointment-reminders.scheduler';
import {
  AdminAppointmentsController,
  PublicAppointmentsController,
} from './appointments.controller';
import { SchedulingModule } from '@/scheduling/scheduling.module';
import { ProfessionalsModule } from '@/professionals/professionals.module';
import { PatientsModule } from '@/patients/patients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppointmentEntity,
      AppointmentStatusHistoryEntity,
    ]),
    SchedulingModule,
    ProfessionalsModule,
    PatientsModule,
  ],
  controllers: [PublicAppointmentsController, AdminAppointmentsController],
  providers: [
    AppointmentsService,
    AvailabilityService,
    AppointmentRemindersService,
    AppointmentRemindersScheduler,
  ],
  exports: [AppointmentsService, AppointmentRemindersService],
})
export class AppointmentsModule {}
