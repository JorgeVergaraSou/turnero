import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import { OfficeEntity } from '@/offices/entities/office.entity';

/**
 * Un llamado del médico a un paciente en sala de espera (append-only).
 * Guarda el consultorio DEL TURNO en ese momento: si el turno se reprograma
 * a otro consultorio después, el llamado histórico no cambia.
 */
@Entity('appointment_calls')
@Index('UQ_appointment_calls_number', ['appointmentId', 'callNumber'], {
  unique: true,
})
@Index('IDX_appointment_calls_called_at', ['calledAt'])
export class AppointmentCallEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'appointment_id' })
  appointmentId!: number;

  @ManyToOne(() => AppointmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  @Column({ type: 'int', unsigned: true, name: 'office_id' })
  officeId!: number;

  @ManyToOne(() => OfficeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'office_id' })
  office!: OfficeEntity;

  @Column({ type: 'int', unsigned: true, name: 'called_by_user_id' })
  calledByUserId!: number;

  /** 1 = primer llamado, 2 = "volver a llamar", … */
  @Column({ type: 'smallint', unsigned: true, name: 'call_number' })
  callNumber!: number;

  @Column({ type: 'datetime', precision: 3, name: 'called_at' })
  calledAt!: Date;
}
