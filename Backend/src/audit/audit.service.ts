import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditAction, AuditResult } from './audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { auditErrorLogger } from '@/config/module-loggers';

export interface AuditEntry {
  actor: Actor;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | number | null;
  patientId?: number | null;
  result?: AuditResult;
  reason?: string | null;
  /** solo datos NO sensibles (nunca contenido clínico) */
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepository: Repository<AuditLogEntity>,
  ) {}

  /**
   * Inserta un registro de auditoría. Si se pasa `manager`, se escribe
   * dentro de esa transacción: la operación y su auditoría se confirman o
   * se revierten juntas. Si falla, lanza (no se traga el error): una
   * operación clínica que no pudo auditarse no debe completarse.
   */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    try {
      const repository = manager
        ? manager.getRepository(AuditLogEntity)
        : this.auditRepository;

      await repository.save(
        repository.create({
          actorUserId: entry.actor.userId,
          ip: entry.actor.ip,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId:
            entry.resourceId === undefined || entry.resourceId === null
              ? null
              : String(entry.resourceId),
          patientId: entry.patientId ?? null,
          result: entry.result ?? AuditResult.SUCCESS,
          reason: entry.reason ?? null,
          metadata: entry.metadata ?? null,
        }),
      );
    } catch (error) {
      handleServiceError(
        error,
        auditErrorLogger,
        'AuditService.record',
        'No se pudo registrar la auditoría de la operación',
        { action: entry.action, resourceType: entry.resourceType },
      );
    }
  }
}
