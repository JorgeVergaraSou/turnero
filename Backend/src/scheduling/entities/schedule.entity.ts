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

/**
 * Horario semanal recurrente de un profesional en un consultorio, ej.
 * "lunes 08:00–12:00, turnos de 20 min, consultorio 2, desde 2026-10-01".
 * No se borra: se desactiva o se le pone `validUntil` (los turnos ya
 * dados no dependen de esta fila, guardan su propia fecha/hora/consultorio).
 */
// CHECKs (rangos de hora/fecha, día, duración) en la migración DomainCheckConstraints:
// TypeORM ignora @Check en MySQL.
@Entity('schedules')
@Index('IDX_schedules_professional_weekday', ['professionalId', 'weekday'])
export class ScheduleEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'professional_id' })
  professionalId!: number;

  @ManyToOne(() => ProfessionalEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'professional_id' })
  professional!: ProfessionalEntity;

  @Column({ type: 'int', unsigned: true, name: 'office_id' })
  officeId!: number;

  @ManyToOne(() => OfficeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'office_id' })
  office!: OfficeEntity;

  /** 1 = lunes … 7 = domingo (ISO) */
  @Column({ type: 'tinyint', unsigned: true })
  weekday!: number;

  @Column({ type: 'time', name: 'start_time' })
  startTime!: string;

  @Column({ type: 'time', name: 'end_time' })
  endTime!: string;

  @Column({ type: 'smallint', unsigned: true, name: 'slot_minutes' })
  slotMinutes!: number;

  @Column({ type: 'date', name: 'valid_from' })
  validFrom!: string;

  @Column({ type: 'date', nullable: true, name: 'valid_until' })
  validUntil!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
