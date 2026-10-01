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
import { PatientEntity } from '@/patients/entities/patient.entity';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { SpecialtyEntity } from '@/specialties/entities/specialty.entity';
import { OfficeEntity } from '@/offices/entities/office.entity';
import { AppointmentSource, AppointmentStatus } from '../appointment-status';

/**
 * Turno = la RESERVA (quién, con quién, cuándo, dónde, en qué estado).
 * Lo que ocurre durante la atención vive en MedicalConsultation, entidad
 * separada: un turno cancelado o ausente no tiene consulta.
 *
 * Protección contra doble reserva en la base: el índice único
 * UQ_appointments_active_slot sobre (professional_id, date, start_time,
 * active_slot), donde active_slot es una columna generada que vale 1 para
 * turnos vigentes y NULL para cancelados. Un UNIQUE admite múltiples NULL,
 * así que un horario cancelado queda libre para otro paciente, pero dos
 * turnos vigentes nunca pueden compartir profesional + fecha + hora — aun
 * si el lock de la transacción fallara por algún motivo.
 */
@Entity('appointments')
@Index(
  'UQ_appointments_active_slot',
  ['professionalId', 'date', 'startTime', 'activeSlot'],
  { unique: true },
)
@Index('IDX_appointments_date_professional', ['date', 'professionalId'])
@Index('IDX_appointments_patient', ['patientId', 'date'])
export class AppointmentEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  /** código que recibe el paciente para consultar/cancelar sin cuenta */
  @Column({ type: 'char', length: 10, unique: true })
  code!: string;

  @Column({ type: 'int', unsigned: true, name: 'patient_id' })
  patientId!: number;

  @ManyToOne(() => PatientEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient!: PatientEntity;

  @Column({ type: 'int', unsigned: true, name: 'professional_id' })
  professionalId!: number;

  @ManyToOne(() => ProfessionalEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'professional_id' })
  professional!: ProfessionalEntity;

  @Column({ type: 'int', unsigned: true, name: 'specialty_id' })
  specialtyId!: number;

  @ManyToOne(() => SpecialtyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'specialty_id' })
  specialty!: SpecialtyEntity;

  @Column({ type: 'int', unsigned: true, name: 'office_id' })
  officeId!: number;

  @ManyToOne(() => OfficeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'office_id' })
  office!: OfficeEntity;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', name: 'start_time' })
  startTime!: string;

  @Column({ type: 'time', name: 'end_time' })
  endTime!: string;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.RESERVADO,
  })
  status!: AppointmentStatus;

  /** 1 = turno vigente (ocupa el horario), NULL = cancelado. Ver índice único. */
  @Column({
    type: 'tinyint',
    nullable: true,
    name: 'active_slot',
    asExpression: "(CASE WHEN `status` = 'CANCELADO' THEN NULL ELSE 1 END)",
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  activeSlot!: number | null;

  @Column({ type: 'enum', enum: AppointmentSource })
  source!: AppointmentSource;

  /** contacto ingresado AL RESERVAR (puede diferir del legajo del paciente;
   * ver PatientsService.findOrCreateForBooking). Las respuestas públicas y
   * los emails usan ESTE nombre, nunca el del legajo: si no, reservar con
   * un DNI ajeno revelaría a quién pertenece. */
  @Column({ type: 'varchar', length: 80, name: 'contact_first_name' })
  contactFirstName!: string;

  @Column({ type: 'varchar', length: 80, name: 'contact_last_name' })
  contactLastName!: string;

  @Column({ type: 'varchar', length: 30, name: 'contact_phone' })
  contactPhone!: string;

  /** obra social declarada al reservar (NULL = particular) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'contact_health_insurance_id',
  })
  contactHealthInsuranceId!: number | null;

  @ManyToOne(() => HealthInsuranceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contact_health_insurance_id' })
  contactHealthInsurance?: HealthInsuranceEntity | null;

  /** número de afiliado declarado al reservar (opcional) */
  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
    name: 'contact_health_insurance_number',
  })
  contactHealthInsuranceNumber!: string | null;

  @Column({
    type: 'varchar',
    length: 150,
    nullable: true,
    name: 'contact_email',
  })
  contactEmail!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'cancellation_reason',
  })
  cancellationReason!: string | null;

  /**
   * Cuándo se emitió el recordatorio (null = todavía no). Se "reclama" con
   * un UPDATE condicional (… WHERE reminder_sent_at IS NULL), así ningún
   * turno recibe dos recordatorios aunque la tarea corra dos veces o haya
   * varias instancias de la API. Reprogramar lo vuelve a null.
   */
  @Column({ type: 'datetime', nullable: true, name: 'reminder_sent_at' })
  reminderSentAt!: Date | null;

  /** null = reservado por el propio paciente (público) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'created_by_user_id',
  })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
