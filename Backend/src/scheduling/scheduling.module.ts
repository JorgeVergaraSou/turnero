import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleEntity } from './entities/schedule.entity';
import { ScheduleExceptionEntity } from './entities/schedule-exception.entity';
import { SchedulingService } from './scheduling.service';
import {
  AdminScheduleExceptionsController,
  AdminSchedulesController,
} from './scheduling.controller';
import { ProfessionalsModule } from '@/professionals/professionals.module';
import { OfficesModule } from '@/offices/offices.module';

/**
 * Horarios y excepciones (la "oferta" de agenda). El cálculo de
 * disponibilidad real (oferta menos turnos ocupados) vive en
 * AppointmentsModule, que es quien conoce los turnos — así este módulo no
 * depende de appointments y no hay dependencia circular.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduleEntity, ScheduleExceptionEntity]),
    ProfessionalsModule,
    OfficesModule,
  ],
  controllers: [AdminSchedulesController, AdminScheduleExceptionsController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
