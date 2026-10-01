import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicalConsultationEntity } from './medical-consultation.entity';
import { DiagnosisType } from '../clinical.enums';

/**
 * Diagnóstico estructurado. `description` es obligatorio (texto libre del
 * médico); `codeSystem` + `code` quedan listos para un catálogo
 * estandarizado (ej. codeSystem='CIE-10', code='J06.9') sin migrar datos.
 */
@Entity('consultation_diagnoses')
export class ConsultationDiagnosisEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'consultation_id' })
  consultationId!: number;

  @ManyToOne(() => MedicalConsultationEntity, (c) => c.diagnoses, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: MedicalConsultationEntity;

  @Column({ type: 'enum', enum: DiagnosisType })
  type!: DiagnosisType;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'code_system' })
  codeSystem!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;
}
