import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { ConsultationStatus } from '../clinical.enums';
import { ConsultationDiagnosisEntity } from './consultation-diagnosis.entity';
import { ConsultationMedicationEntity } from './consultation-medication.entity';
import { ConsultationStudyRequestEntity } from './consultation-study-request.entity';
import { ConsultationAmendmentEntity } from './consultation-amendment.entity';

/**
 * Consulta médica = lo que OCURRIÓ en la atención. Separada del turno (que
 * es solo la reserva): 1 turno → 0..1 consulta. patient_id y
 * professional_id se guardan también acá (no solo vía el turno) para que
 * la historia clínica longitudinal sea una sola consulta por paciente, y
 * para que futuras recetas/órdenes/adjuntos cuelguen de consultation_id.
 *
 * Inmutable una vez FINALIZADA: además de la validación en el service,
 * triggers en la base (migración ClinicalImmutability) rechazan cualquier
 * UPDATE/DELETE sobre una consulta finalizada o sus ítems. Trazabilidad
 * para una futura firma digital: quién la creó (professional/createdBy),
 * quién y cuándo la finalizó, y `contentHash` (SHA-256 del contenido al
 * finalizar) para verificar que no cambió.
 */
@Entity('medical_consultations')
@Index('IDX_consultations_patient', ['patientId', 'startedAt'])
@Index('IDX_consultations_professional', ['professionalId', 'startedAt'])
export class MedicalConsultationEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, unique: true, name: 'appointment_id' })
  appointmentId!: number;

  @OneToOne(() => AppointmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  @Column({ type: 'int', unsigned: true, name: 'patient_id' })
  patientId!: number;

  @ManyToOne(() => PatientEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient!: PatientEntity;

  @Column({ type: 'int', unsigned: true, name: 'professional_id' })
  professionalId!: number;

  @ManyToOne(() => ProfessionalEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'professional_id' })
  professional!: ProfessionalEntity;

  @Column({
    type: 'enum',
    enum: ConsultationStatus,
    default: ConsultationStatus.BORRADOR,
  })
  status!: ConsultationStatus;

  // --- registro clínico ---
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  anamnesis!: string | null;

  @Column({ type: 'text', nullable: true, name: 'physical_exam' })
  physicalExam!: string | null;

  @Column({ type: 'text', nullable: true })
  evolution!: string | null;

  @Column({ type: 'text', nullable: true })
  indications!: string | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  // --- signos vitales (opcionales) ---
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'weight_kg',
  })
  weightKg!: string | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 1,
    nullable: true,
    name: 'height_cm',
  })
  heightCm!: string | null;

  @Column({
    type: 'smallint',
    unsigned: true,
    nullable: true,
    name: 'systolic_bp',
  })
  systolicBp!: number | null;

  @Column({
    type: 'smallint',
    unsigned: true,
    nullable: true,
    name: 'diastolic_bp',
  })
  diastolicBp!: number | null;

  @Column({
    type: 'smallint',
    unsigned: true,
    nullable: true,
    name: 'heart_rate',
  })
  heartRate!: number | null;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    nullable: true,
    name: 'temperature_c',
  })
  temperatureC!: string | null;

  @Column({
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    name: 'oxygen_saturation',
  })
  oxygenSaturation!: number | null;

  // --- trazabilidad ---
  @Column({ type: 'datetime', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'int', unsigned: true, name: 'created_by_user_id' })
  createdByUserId!: number;

  @Column({ type: 'datetime', nullable: true, name: 'finalized_at' })
  finalizedAt!: Date | null;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'finalized_by_user_id',
  })
  finalizedByUserId!: number | null;

  /** SHA-256 (hex) del contenido clínico al finalizar */
  @Column({ type: 'char', length: 64, nullable: true, name: 'content_hash' })
  contentHash!: string | null;

  @OneToMany(() => ConsultationDiagnosisEntity, (d) => d.consultation)
  diagnoses!: ConsultationDiagnosisEntity[];

  @OneToMany(() => ConsultationMedicationEntity, (m) => m.consultation)
  medications!: ConsultationMedicationEntity[];

  @OneToMany(() => ConsultationStudyRequestEntity, (s) => s.consultation)
  studyRequests!: ConsultationStudyRequestEntity[];

  @OneToMany(() => ConsultationAmendmentEntity, (a) => a.consultation)
  amendments!: ConsultationAmendmentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
