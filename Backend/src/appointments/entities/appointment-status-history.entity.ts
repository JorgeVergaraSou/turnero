import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { AppointmentStatus } from '../appointment-status';

/**
 * Historial de un turno (append-only): cada cambio de estado y cada
 * reprogramación (from/to fecha y hora). Es historia de DOMINIO, visible en
 * la UI — complementa (no reemplaza) a audit_logs.
 */
@Entity('appointment_status_history')
@Index('IDX_appointment_history_appointment', ['appointmentId', 'createdAt'])
export class AppointmentStatusHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'appointment_id' })
  appointmentId!: number;

  @ManyToOne(() => AppointmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  /** null = creación */
  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    nullable: true,
    name: 'from_status',
  })
  fromStatus!: AppointmentStatus | null;

  @Column({ type: 'enum', enum: AppointmentStatus, name: 'to_status' })
  toStatus!: AppointmentStatus;

  /** solo reprogramaciones */
  @Column({ type: 'date', nullable: true, name: 'from_date' })
  fromDate!: string | null;

  @Column({ type: 'time', nullable: true, name: 'from_start_time' })
  fromStartTime!: string | null;

  @Column({ type: 'date', nullable: true, name: 'to_date' })
  toDate!: string | null;

  @Column({ type: 'time', nullable: true, name: 'to_start_time' })
  toStartTime!: string | null;

  /** null = acción pública del paciente */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'changed_by_user_id',
  })
  changedByUserId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
