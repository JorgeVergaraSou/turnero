import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalConsultationEntity } from './entities/medical-consultation.entity';
import { ConsultationDiagnosisEntity } from './entities/consultation-diagnosis.entity';
import { ConsultationMedicationEntity } from './entities/consultation-medication.entity';
import { ConsultationStudyRequestEntity } from './entities/consultation-study-request.entity';
import { ConsultationAmendmentEntity } from './entities/consultation-amendment.entity';
import { ConsultationsService } from './consultations.service';
import { ClinicalAccessService } from './clinical-access.service';
import { DoctorController } from './doctor.controller';
import { AppointmentCallEntity } from './entities/appointment-call.entity';
import { AppointmentCallsService } from './appointment-calls.service';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import { AppointmentsModule } from '@/appointments/appointments.module';
import { ProfessionalsModule } from '@/professionals/professionals.module';

/**
 * Atención médica e historia clínica. Punto de extensión para lo futuro
 * (recetas, órdenes, adjuntos, firma): nuevas entidades que referencien
 * medical_consultations.id y nuevos services en este módulo o en módulos
 * propios que importen este — no hace falta tocar turnos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicalConsultationEntity,
      ConsultationDiagnosisEntity,
      ConsultationMedicationEntity,
      ConsultationStudyRequestEntity,
      ConsultationAmendmentEntity,
      AppointmentEntity,
      AppointmentCallEntity,
    ]),
    AppointmentsModule,
    ProfessionalsModule,
  ],
  controllers: [DoctorController],
  providers: [
    ConsultationsService,
    ClinicalAccessService,
    AppointmentCallsService,
  ],
})
export class ClinicalModule {}
