import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicalConsultationEntity } from './medical-consultation.entity';
import { StudyRequestType } from '../clinical.enums';

/**
 * Estudio solicitado en la consulta. Punto de extensión para futuras
 * órdenes médicas (medical_orders con estado) y resultados/adjuntos: esos
 * módulos referenciarían esta fila o la consulta, sin cambiar esta tabla.
 */
@Entity('consultation_study_requests')
export class ConsultationStudyRequestEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'consultation_id' })
  consultationId!: number;

  @ManyToOne(() => MedicalConsultationEntity, (c) => c.studyRequests, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: MedicalConsultationEntity;

  @Column({ type: 'enum', enum: StudyRequestType })
  type!: StudyRequestType;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;
}
