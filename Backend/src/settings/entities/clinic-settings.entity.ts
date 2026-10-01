import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CallNameFormat } from '@/common/enums/call-name-format.enum';

/**
 * Configuración administrativa del consultorio. Una sola fila (id = 1,
 * creada por la migración ClinicSettings con los valores por defecto).
 * CHECKs de rangos en esa misma migración (TypeORM ignora @Check en MySQL).
 */
@Entity('clinic_settings')
export class ClinicSettingsEntity {
  @PrimaryColumn({ type: 'tinyint', unsigned: true })
  id!: number;

  /** nombre que ven los pacientes (pantallas públicas, comprobante, mails) */
  @Column({ type: 'varchar', length: 100, name: 'clinic_name' })
  clinicName!: string;

  /** teléfono para cuando el paciente no puede resolver algo online */
  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    name: 'contact_phone',
  })
  contactPhone!: string | null;

  /** si es false, solo recepción puede dar turnos */
  @Column({ type: 'boolean', default: true, name: 'public_booking_enabled' })
  publicBookingEnabled!: boolean;

  /** cuántos días hacia adelante se pueden reservar turnos */
  @Column({
    type: 'smallint',
    unsigned: true,
    default: 90,
    name: 'booking_horizon_days',
  })
  bookingHorizonDays!: number;

  /** anticipación mínima (horas) para que el paciente cancele online */
  @Column({
    type: 'smallint',
    unsigned: true,
    default: 0,
    name: 'public_cancel_min_hours',
  })
  publicCancelMinHours!: number;

  /** horas antes del turno en que se manda el recordatorio (0 = no se mandan) */
  @Column({
    type: 'smallint',
    unsigned: true,
    default: 24,
    name: 'reminder_hours_before',
  })
  reminderHoursBefore!: number;

  /** turnos pendientes (futuros) que puede tener un mismo DNI reservando
   * por la web; 0 = sin tope. Recepción no tiene este límite. */
  @Column({
    type: 'smallint',
    unsigned: true,
    default: 2,
    name: 'public_max_pending_per_patient',
  })
  publicMaxPendingPerPatient!: number;

  /** roles que deben usar verificación en dos pasos, 'ADMIN,MEDICO' ('' = ninguno) */
  @Column({
    type: 'varchar',
    length: 60,
    default: '',
    name: 'two_factor_roles',
  })
  twoFactorRoles!: string;

  /** llamado de pacientes por pantalla y voz: si es false, el médico no puede llamar */
  @Column({ type: 'boolean', default: true, name: 'calls_enabled' })
  callsEnabled!: boolean;

  /** cómo se nombra al paciente en la pantalla y la voz (se aplica en el servidor) */
  @Column({
    type: 'enum',
    enum: CallNameFormat,
    default: CallNameFormat.FULL,
    name: 'call_name_format',
  })
  callNameFormat!: CallNameFormat;

  /** cuántas veces repite la voz cada llamado (1 a 3) */
  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 2,
    name: 'call_voice_repeats',
  })
  callVoiceRepeats!: number;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'updated_by_user_id',
  })
  updatedByUserId!: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
