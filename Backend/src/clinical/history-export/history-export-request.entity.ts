import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum HistoryExportStatus {
  /** recepción lo registró; el médico todavía no emitió la copia */
  PENDIENTE = 'PENDIENTE',
  /** el médico generó el PDF; falta confirmar que se lo entregó */
  EMITIDA = 'EMITIDA',
  ENTREGADA = 'ENTREGADA',
  /** solo antes de emitir */
  CANCELADA = 'CANCELADA',
}

export enum RequesterType {
  TITULAR = 'TITULAR',
  REPRESENTANTE = 'REPRESENTANTE',
}

/** Estados en los que el pedido sigue corriendo contra el plazo de 48 h. */
export const OPEN_STATUSES = [
  HistoryExportStatus.PENDIENTE,
  HistoryExportStatus.EMITIDA,
] as const;

/**
 * Trámite de un pedido de copia de la historia clínica. Guarda SOLO datos
 * administrativos y de control (quién, cuándo, huellas): nunca contenido
 * clínico, y el PDF no se persiste. No se borra (trigger en la base).
 */
@Entity('history_export_requests')
@Index('IDX_history_exports_status_due', ['status', 'dueAt'])
@Index('IDX_history_exports_professional', ['assignedProfessionalId', 'status'])
@Index('IDX_history_exports_patient', ['patientId', 'status'])
export class HistoryExportRequestEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'patient_id' })
  patientId!: number;

  @Column({ type: 'enum', enum: RequesterType, name: 'requester_type' })
  requesterType!: RequesterType;

  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
    name: 'requester_name',
  })
  requesterName!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'requester_document',
  })
  requesterDocument!: string | null;

  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
    name: 'requester_relationship',
  })
  requesterRelationship!: string | null;

  /** recepción verificó el DNI de quien pide */
  @Column({ type: 'boolean', name: 'identity_checked' })
  identityChecked!: boolean;

  @Column({ type: 'int', unsigned: true, name: 'requested_by_user_id' })
  requestedByUserId!: number;

  @Column({ type: 'int', unsigned: true, name: 'assigned_professional_id' })
  assignedProfessionalId!: number;

  @Column({
    type: 'enum',
    enum: HistoryExportStatus,
    default: HistoryExportStatus.PENDIENTE,
  })
  status!: HistoryExportStatus;

  @Column({ type: 'datetime', precision: 3, name: 'requested_at' })
  requestedAt!: Date;

  /** requestedAt + 48 h corridas (art. 14, Ley 26.529) */
  @Column({ type: 'datetime', precision: 3, name: 'due_at' })
  dueAt!: Date;

  @Column({ type: 'datetime', precision: 3, nullable: true, name: 'issued_at' })
  issuedAt!: Date | null;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'issued_by_user_id',
  })
  issuedByUserId!: number | null;

  /** cuántas veces se generó el PDF de este pedido (reintentos de descarga) */
  @Column({ type: 'int', unsigned: true, default: 0, name: 'issue_count' })
  issueCount!: number;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'consultations_count',
  })
  consultationsCount!: number | null;

  /** SHA-256 de la lista ordenada de huellas de las consultas incluidas */
  @Column({ type: 'char', length: 64, nullable: true, name: 'chain_hash' })
  chainHash!: string | null;

  /** SHA-256 de los bytes del último PDF emitido (el PDF no se guarda) */
  @Column({ type: 'char', length: 64, nullable: true, name: 'pdf_hash' })
  pdfHash!: string | null;

  @Column({
    type: 'datetime',
    precision: 3,
    nullable: true,
    name: 'delivered_at',
  })
  deliveredAt!: Date | null;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'delivered_by_user_id',
  })
  deliveredByUserId!: number | null;

  @Column({
    type: 'datetime',
    precision: 3,
    nullable: true,
    name: 'cancelled_at',
  })
  cancelledAt!: Date | null;

  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'cancelled_by_user_id',
  })
  cancelledByUserId!: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'cancel_reason',
  })
  cancelReason!: string | null;
}
