import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicalConsultationEntity } from './medical-consultation.entity';

/**
 * Medicación indicada en la consulta. Estructurada (medicamento, dosis,
 * frecuencia, duración) para que una futura receta (prescriptions /
 * prescription_items) pueda generarse a partir de estos ítems.
 */
@Entity('consultation_medications')
export class ConsultationMedicationEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'consultation_id' })
  consultationId!: number;

  @ManyToOne(() => MedicalConsultationEntity, (c) => c.medications, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: MedicalConsultationEntity;

  @Column({ type: 'varchar', length: 200, name: 'drug_name' })
  drugName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dose!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  frequency!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  duration!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;
}
