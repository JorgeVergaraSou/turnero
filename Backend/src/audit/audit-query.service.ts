import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditAction } from './audit.enums';
import { AuditQueryDto } from './dto/audit-query.dto';
import { UserEntity } from '@/users/entities/user.entity';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { auditErrorLogger } from '@/config/module-loggers';

/** Acciones sobre información clínica (accesos y escrituras). */
/** inicios de sesión y cambios de contraseña */
export const ACCESS_ACTIONS: readonly AuditAction[] = [
  AuditAction.LOGIN,
  AuditAction.LOGOUT,
  AuditAction.TWO_FACTOR_ENABLE,
  AuditAction.TWO_FACTOR_RESET,
  AuditAction.USER_UNLOCK,
  AuditAction.PASSWORD_CHANGE,
  AuditAction.PASSWORD_RESET_EMAIL,
  AuditAction.USER_PASSWORD_RESET,
];

export const CLINICAL_ACTIONS: readonly AuditAction[] = [
  AuditAction.START_ATTENTION,
  AuditAction.CALL_PATIENT,
  AuditAction.VIEW_PATIENT,
  AuditAction.VIEW_CLINICAL_HISTORY,
  AuditAction.VIEW_MEDICAL_CONSULTATION,
  AuditAction.CREATE_MEDICAL_CONSULTATION,
  AuditAction.UPDATE_MEDICAL_CONSULTATION,
  AuditAction.FINALIZE_MEDICAL_CONSULTATION,
  AuditAction.AMEND_MEDICAL_CONSULTATION,
];

/**
 * Consulta de la auditoría (solo lectura, permiso audit:read). Muestra
 * QUIÉN hizo QUÉ sobre QUÉ paciente/recurso y con qué resultado — el log
 * nunca guarda contenido clínico, así que esto tampoco lo expone: sirve
 * para revisar accesos (ej. "¿quién vio la historia de este paciente?"),
 * no para leer historias.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepository: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
  ) {}

  async search(query: AuditQueryDto) {
    try {
      const qb = this.auditRepository
        .createQueryBuilder('log')
        .orderBy('log.createdAt', 'DESC')
        .addOrderBy('log.id', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);

      // created_at es la hora local del servidor de base (el consultorio)
      if (query.from) {
        qb.andWhere('log.createdAt >= :from', {
          from: `${query.from} 00:00:00`,
        });
      }
      if (query.to) {
        qb.andWhere('log.createdAt <= :to', {
          to: `${query.to} 23:59:59.999999`,
        });
      }
      if (query.category === 'CLINICAL') {
        qb.andWhere('log.action IN (:...clinical)', {
          clinical: CLINICAL_ACTIONS,
        });
      } else if (query.category === 'ACCESS') {
        qb.andWhere('log.action IN (:...access)', { access: ACCESS_ACTIONS });
      } else if (query.category === 'ADMINISTRATIVE') {
        qb.andWhere('log.action NOT IN (:...excluded)', {
          excluded: [...CLINICAL_ACTIONS, ...ACCESS_ACTIONS],
        });
      }
      if (query.action)
        qb.andWhere('log.action = :action', { action: query.action });
      if (query.result)
        qb.andWhere('log.result = :result', { result: query.result });
      if (query.patientId)
        qb.andWhere('log.patientId = :patientId', {
          patientId: query.patientId,
        });
      if (query.actorUserId) {
        qb.andWhere('log.actorUserId = :actorUserId', {
          actorUserId: query.actorUserId,
        });
      }

      const [logs, total] = await qb.getManyAndCount();

      // nombres de quién y de qué paciente, en dos consultas (sin N+1)
      const userIds = [
        ...new Set(
          logs.map((l) => l.actorUserId).filter((id): id is number => !!id),
        ),
      ];
      const patientIds = [
        ...new Set(
          logs.map((l) => l.patientId).filter((id): id is number => !!id),
        ),
      ];
      const [users, patients] = await Promise.all([
        userIds.length
          ? this.userRepository.find({
              where: { idUser: In(userIds) },
              withDeleted: true,
            })
          : [],
        patientIds.length
          ? this.patientRepository.findBy({ id: In(patientIds) })
          : [],
      ]);
      const userById = new Map(users.map((u) => [u.idUser, u]));
      const patientById = new Map(patients.map((p) => [p.id, p]));

      return {
        items: logs.map((log) => {
          const user = log.actorUserId
            ? userById.get(log.actorUserId)
            : undefined;
          const patient = log.patientId
            ? patientById.get(log.patientId)
            : undefined;
          return {
            id: log.id,
            createdAt: log.createdAt,
            action: log.action,
            clinical: CLINICAL_ACTIONS.includes(log.action),
            result: log.result,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
            reason: log.reason,
            metadata: log.metadata,
            ip: log.ip,
            actor: user
              ? {
                  id: user.idUser,
                  name: `${user.nombre} ${user.apellido}`,
                  nickUsuario: user.nickUsuario,
                  role: user.role,
                }
              : null,
            patient: patient
              ? {
                  id: patient.id,
                  name: `${patient.lastName}, ${patient.firstName}`,
                  documentNumber: patient.documentNumber,
                }
              : log.patientId
                ? { id: log.patientId, name: null, documentNumber: null }
                : null,
          };
        }),
        total,
        page: query.page,
        limit: query.limit,
      };
    } catch (error) {
      handleServiceError(
        error,
        auditErrorLogger,
        'AuditQueryService.search',
        'Error al consultar la auditoría',
      );
    }
  }
}
