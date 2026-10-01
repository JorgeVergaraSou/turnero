import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '@/users/entities/user.entity';
import { SpecialtyEntity } from '@/specialties/entities/specialty.entity';

/**
 * Perfil profesional de un usuario MEDICO. El usuario (UserEntity) sigue
 * siendo el dueño de las credenciales, el rol y el acceso; acá viven solo
 * los datos para ejercer (matrícula, especialidades, estado). Nombre y
 * apellido NO se duplican: salen del usuario.
 *
 * No se borra: se desactiva (`active=false`) — deja de aparecer en la
 * reserva pública y no se le pueden dar turnos nuevos, pero sus turnos y
 * consultas históricos siguen referenciándolo.
 */
@Entity('professionals')
export class ProfessionalEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, unique: true, name: 'user_id' })
  userId!: number;

  @OneToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'idUser' })
  user!: UserEntity;

  /** matrícula profesional */
  @Column({ type: 'varchar', length: 50, unique: true, name: 'license_number' })
  licenseNumber!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @ManyToMany(() => SpecialtyEntity)
  @JoinTable({
    name: 'professional_specialties',
    joinColumn: { name: 'professional_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'specialty_id', referencedColumnName: 'id' },
  })
  specialties!: SpecialtyEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
