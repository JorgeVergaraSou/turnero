import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HealthInsuranceEntity } from '@/health-insurances/entities/health-insurance.entity';

/**
 * Paciente. Independiente de UserEntity: un paciente NO tiene cuenta ni
 * contraseña (reserva sin registrarse). Acá solo viven datos
 * ADMINISTRATIVOS; lo clínico vive en las consultas médicas, con controles
 * de acceso más estrictos.
 *
 * No se borra nunca (tiene historia clínica asociada).
 */
@Entity('patients')
@Index('IDX_patients_name', ['lastName', 'firstName'])
export class PatientEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 80, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 80, name: 'last_name' })
  lastName!: string;

  /** DNI normalizado (sin puntos/espacios/guiones, en mayúsculas) */
  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    name: 'document_number',
  })
  documentNumber!: string;

  @Column({ type: 'varchar', length: 30 })
  phone!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'date', nullable: true, name: 'birth_date' })
  birthDate!: string | null;

  /** obra social; NULL = particular (o no informada, en legajos viejos) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'health_insurance_id',
  })
  healthInsuranceId!: number | null;

  @ManyToOne(() => HealthInsuranceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'health_insurance_id' })
  healthInsurance?: HealthInsuranceEntity | null;

  /** número de afiliado (tal como figura en la credencial); NULL si es
   * particular o todavía no se cargó */
  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
    name: 'health_insurance_number',
  })
  healthInsuranceNumber!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
