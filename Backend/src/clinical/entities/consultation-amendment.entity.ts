import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicalConsultationEntity } from './medical-consultation.entity';

/**
 * Enmienda (addendum) a una consulta FINALIZADA: la forma trazable de
 * corregir o ampliar un registro clínico sin modificarlo. Append-only
 * (triggers en la base rechazan UPDATE/DELETE): autor, motivo y fecha.
 */
@Entity('consultation_amendments')
export class ConsultationAmendmentEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'consultation_id' })
  consultationId!: number;

  @ManyToOne(() => MedicalConsultationEntity, (c) => c.amendments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: MedicalConsultationEntity;

  @Column({ type: 'int', unsigned: true, name: 'author_user_id' })
  authorUserId!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
