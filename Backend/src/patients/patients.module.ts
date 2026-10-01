import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientEntity } from './entities/patient.entity';
import { PatientsService } from './patients.service';
import { AdminPatientsController } from './patients.controller';
import { HealthInsurancesModule } from '@/health-insurances/health-insurances.module';

@Module({
  imports: [TypeOrmModule.forFeature([PatientEntity]), HealthInsurancesModule],
  controllers: [AdminPatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
