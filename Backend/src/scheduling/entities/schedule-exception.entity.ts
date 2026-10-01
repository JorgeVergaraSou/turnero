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
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { OfficeEntity } from '@/offices/entities/office.entity';
import { ScheduleExceptionType } from '../scheduling.enums';

/**
 * Excepción a la agenda en un rango de días [startDate, endDate]:
 * - Sin horas (startTime/endTime null): aplica a los días completos
 *   (vacaciones, feriado, licencia).
 * - Con horas: aplica a esa franja en cada día del rango (reunión, bloqueo
 *   de 10:00 a 11:00).
 * - `professionalId` null: aplica a TODOS los profesionales (feriado).
 *
 * Todos los tipos QUITAN disponibilidad salvo HORARIO_ESPECIAL, que la
 * AGREGA (requiere profesional, horas, consultorio y duración de turno).
 *
 * No se borra: se desactiva (`active=false`) — queda el registro de que
 * existió.
 */
// CHECKs (rangos de hora/fecha, día, duración) en la migración DomainCheckConstraints:
// TypeORM ignora @Check en MySQL.
@Entity('schedule_exceptions')
@Index('IDX_schedule_exceptions_range', ['startDate', 'endDate'])
export class ScheduleExceptionEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  /** null = aplica a todos los profesionales (ej. feriado) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'professional_id',
  })
  professionalId!: number | null;

  @ManyToOne(() => ProfessionalEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'professional_id' })
  professional!: ProfessionalEntity | null;

  @Column({ type: 'enum', enum: ScheduleExceptionType })
  type!: ScheduleExceptionType;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  @Column({ type: 'time', nullable: true, name: 'start_time' })
  startTime!: string | null;

  @Column({ type: 'time', nullable: true, name: 'end_time' })
  endTime!: string | null;

  /** solo HORARIO_ESPECIAL */
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'office_id' })
  officeId!: number | null;

  @ManyToOne(() => OfficeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'office_id' })
  office!: OfficeEntity | null;

  /** solo HORARIO_ESPECIAL */
  @Column({
    type: 'smallint',
    unsigned: true,
    nullable: true,
    name: 'slot_minutes',
  })
  slotMinutes!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', unsigned: true, name: 'created_by_user_id' })
  createdByUserId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
