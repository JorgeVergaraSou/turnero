import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Obra social / prepaga. No se borra nunca: se desactiva (`active=false`)
 * para no romper los legajos y turnos que la referencian. "Particular"
 * (sin obra social) no es una fila: es `health_insurance_id` NULL. */
@Entity('health_insurances')
export class HealthInsuranceEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
