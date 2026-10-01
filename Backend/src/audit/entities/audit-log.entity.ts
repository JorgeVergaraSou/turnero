import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction, AuditResult } from '../audit.enums';

/**
 * Registro de auditoría, append-only: AuditService solo inserta, nunca
 * actualiza ni borra. Guarda QUIÉN hizo QUÉ sobre QUÉ recurso (y de qué
 * paciente) y con qué resultado — nunca el contenido clínico en sí
 * (motivo, diagnóstico, etc.). `metadata` es solo para datos no sensibles
 * (ej. nombres de campos modificados, estado anterior/nuevo).
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_patient', ['patientId', 'createdAt'])
@Index('IDX_audit_logs_actor', ['actorUserId', 'createdAt'])
@Index('IDX_audit_logs_resource', ['resourceType', 'resourceId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  /** null = operación pública (paciente sin cuenta) */
  @Column({
    type: 'int',
    unsigned: true,
    nullable: true,
    name: 'actor_user_id',
  })
  actorUserId!: number | null;

  @Column({ type: 'varchar', length: 60 })
  action!: AuditAction;

  @Column({ type: 'varchar', length: 40, name: 'resource_type' })
  resourceType!: string;

  @Column({ type: 'varchar', length: 40, nullable: true, name: 'resource_id' })
  resourceId!: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true, name: 'patient_id' })
  patientId!: number | null;

  @Column({ type: 'enum', enum: AuditResult })
  result!: AuditResult;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
