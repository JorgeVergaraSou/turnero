import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ConsentChannel {
  /** reserva por la web: lo aceptó quien reservó */
  PUBLICO = 'PUBLICO',
  /** recepción informó al paciente en persona (todavía sin uso) */
  RECEPCION = 'RECEPCION',
}

/**
 * Constancia de que se informó el aviso de privacidad (y se aceptó) al
 * reservar. Una fila por turno: los datos personales que ingresa quien
 * reserva quedan en el turno, y el legajo no se pisa si el DNI ya existía.
 * Solo se agregan filas (triggers en la base).
 *
 * NO guarda la IP: la versión, la huella del texto y la fecha ya prueban qué
 * se aceptó, y la IP iría contra la minimización de datos.
 */
@Entity('privacy_consents')
export class PrivacyConsentEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, unique: true, name: 'appointment_id' })
  appointmentId!: number;

  @Column({ type: 'int', unsigned: true, name: 'patient_id' })
  patientId!: number;

  @Column({ type: 'int', unsigned: true, name: 'notice_version' })
  noticeVersion!: number;

  /** huella del texto aceptado (copia de privacy_notices.content_hash) */
  @Column({ type: 'char', length: 64, name: 'notice_hash' })
  noticeHash!: string;

  @Column({ type: 'enum', enum: ConsentChannel })
  channel!: ConsentChannel;

  /** null en la reserva pública (no hay usuario) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'recorded_by_user_id',
  })
  recordedByUserId!: number | null;

  @Column({ type: 'datetime', precision: 3, name: 'accepted_at' })
  acceptedAt!: Date;
}
