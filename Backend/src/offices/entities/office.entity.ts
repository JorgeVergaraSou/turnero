import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Consultorio físico donde atiende un profesional. No se borra: se desactiva. */
@Entity('offices')
export class OfficeEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 200 })
  address!: string;

  /** piso / número de consultorio / indicaciones para llegar */
  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    name: 'location_details',
  })
  locationDetails!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
