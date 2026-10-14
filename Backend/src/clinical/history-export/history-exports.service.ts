import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import { AppointmentStatus } from '@/appointments/appointment-status';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { ProfessionalsService } from '@/professionals/professionals.service';
import { SettingsService } from '@/settings/settings.service';
import { UserEntity } from '@/users/entities/user.entity';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { clinicalErrorLogger } from '@/config/module-loggers';
import { ClinicalAccessService } from '../clinical-access.service';
import { ConsultationsService } from '../consultations.service';
import {
  CancelHistoryExportDto,
  CreateHistoryExportDto,
} from './history-export.dto';
import {
  HistoryExportRequestEntity,
  HistoryExportStatus,
  OPEN_STATUSES,
  RequesterType,
} from './history-export-request.entity';
import {
  buildHistoryPdf,
  computeChainHash,
  sha256Hex,
} from './history-export-pdf';

/** Plazo para entregar la copia (art. 14, Ley 26.529). */
export const EXPORT_DEADLINE_HOURS = 48;
const HOUR_MS = 3_600_000;

export const ALREADY_OPEN_MESSAGE =
  'Este paciente ya tiene un pedido de copia en curso.';
export const NO_RELATION_MESSAGE =
  'El profesional elegido no atendió a este paciente.';

/**
 * Un pedido tal como lo ven recepción, administración y el médico asignado.
 * Solo datos del trámite y administrativos del paciente: nada clínico.
 */
export interface HistoryExportView {
  id: number;
  status: HistoryExportStatus;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    documentNumber: string;
  };
  requesterType: RequesterType;
  requesterName: string | null;
  requesterDocument: string | null;
  requesterRelationship: string | null;
  professional: { id: number; firstName: string; lastName: string };
  requestedAt: Date;
  dueAt: Date;
  /** minutos hasta el vencimiento (negativo si ya venció); null si ya no corre el plazo */
  minutesLeft: number | null;
  overdue: boolean;
  issuedAt: Date | null;
  issueCount: number;
  consultationsCount: number | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface HistoryExportSummary {
  open: number;
  overdue: number;
  /** el vencimiento más próximo entre los pedidos abiertos */
  nextDueAt: Date | null;
  /** minutos hasta ese vencimiento (negativo si ya venció) */
  nextMinutesLeft: number | null;
}

export interface IssuedHistoryPdf {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class HistoryExportsService {
  constructor(
    @InjectRepository(HistoryExportRequestEntity)
    private readonly requests: Repository<HistoryExportRequestEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointments: Repository<AppointmentEntity>,
    private readonly dataSource: DataSource,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly consultationsService: ConsultationsService,
    private readonly professionalsService: ProfessionalsService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------- recepción

  /**
   * Profesionales que atendieron al paciente (turno no cancelado): los únicos
   * que pueden emitir su copia. Dato administrativo, sin contenido clínico.
   * El primero es el de la atención más reciente.
   */
  async candidates(patientId: number) {
    const rows = await this.appointments
      .createQueryBuilder('a')
      .select('a.professionalId', 'professionalId')
      .addSelect('MAX(a.date)', 'lastDate')
      .where('a.patientId = :patientId', { patientId })
      .andWhere('a.status <> :cancelled', {
        cancelled: AppointmentStatus.CANCELADO,
      })
      .groupBy('a.professionalId')
      .orderBy('lastDate', 'DESC')
      .getRawMany<{ professionalId: number }>();
    const ids = rows.map((r) => Number(r.professionalId));
    if (!ids.length) return [];
    const professionals = await this.dataSource
      .getRepository(ProfessionalEntity)
      .find({
        where: { id: In(ids), active: true },
        relations: { user: true, specialties: true },
      });
    return ids
      .map((id) => professionals.find((p) => p.id === id))
      .filter((p): p is ProfessionalEntity => !!p)
      .map((p) => ({
        id: p.id,
        firstName: p.user.nombre,
        lastName: p.user.apellido,
        specialties: p.specialties.map((s) => s.name),
      }));
  }

  async create(
    dto: CreateHistoryExportDto,
    actor: Actor,
  ): Promise<HistoryExportView> {
    try {
      const patient = await this.dataSource
        .getRepository(PatientEntity)
        .findOneBy({ id: dto.patientId });
      if (!patient) throw new NotFoundException('Paciente no encontrado');
      await this.assertAssignable(dto.assignedProfessionalId, dto.patientId);

      const now = new Date();
      const saved = await this.dataSource.transaction(async (manager) => {
        // un solo pedido en curso por paciente (evita duplicados por doble clic)
        const open = await manager
          .getRepository(HistoryExportRequestEntity)
          .findOne({
            where: { patientId: dto.patientId, status: In([...OPEN_STATUSES]) },
            lock: { mode: 'pessimistic_write' },
          });
        if (open) throw new ConflictException(ALREADY_OPEN_MESSAGE);

        const isRep = dto.requesterType === RequesterType.REPRESENTANTE;
        const request = await manager.save(
          manager.getRepository(HistoryExportRequestEntity).create({
            patientId: dto.patientId,
            requesterType: dto.requesterType,
            requesterName: isRep ? (dto.requesterName ?? null) : null,
            requesterDocument: isRep ? (dto.requesterDocument ?? null) : null,
            requesterRelationship: isRep
              ? (dto.requesterRelationship ?? null)
              : null,
            identityChecked: true,
            requestedByUserId: actor.userId!,
            assignedProfessionalId: dto.assignedProfessionalId,
            status: HistoryExportStatus.PENDIENTE,
            requestedAt: now,
            dueAt: new Date(now.getTime() + EXPORT_DEADLINE_HOURS * HOUR_MS),
          }),
        );
        await this.auditService.record(
          {
            actor,
            action: AuditAction.HISTORY_EXPORT_REQUEST,
            resourceType: 'history_export_request',
            resourceId: request.id,
            patientId: dto.patientId,
            metadata: {
              requesterType: dto.requesterType,
              assignedProfessionalId: dto.assignedProfessionalId,
            },
          },
          manager,
        );
        return request;
      });
      return (await this.viewsByIds([saved.id]))[0];
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'HistoryExportsService.create',
        'Error al registrar el pedido de copia',
        { patientId: dto.patientId },
      );
    }
  }

  async cancel(
    id: number,
    dto: CancelHistoryExportDto,
    actor: Actor,
  ): Promise<HistoryExportView> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const request = await this.lockOrFail(manager, id);
        if (request.status !== HistoryExportStatus.PENDIENTE) {
          throw new ConflictException(
            'Solo se puede cancelar un pedido que todavía no se emitió.',
          );
        }
        request.status = HistoryExportStatus.CANCELADA;
        request.cancelledAt = new Date();
        request.cancelledByUserId = actor.userId;
        request.cancelReason = dto.reason;
        await manager.save(request);
        await this.auditService.record(
          {
            actor,
            action: AuditAction.HISTORY_EXPORT_CANCEL,
            resourceType: 'history_export_request',
            resourceId: id,
            patientId: request.patientId,
          },
          manager,
        );
      });
      return (await this.viewsByIds([id]))[0];
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'HistoryExportsService.cancel',
        'Error al cancelar el pedido de copia',
        { id },
      );
    }
  }

  // ----------------------------------------------------------- administración

  async reassign(
    id: number,
    professionalId: number,
    actor: Actor,
  ): Promise<HistoryExportView> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const request = await this.lockOrFail(manager, id);
        if (request.status !== HistoryExportStatus.PENDIENTE) {
          throw new ConflictException(
            'Solo se puede reasignar un pedido que todavía no se emitió.',
          );
        }
        if (request.assignedProfessionalId === professionalId) {
          throw new ConflictException(
            'El pedido ya está asignado a ese médico.',
          );
        }
        await this.assertAssignable(professionalId, request.patientId);
        const from = request.assignedProfessionalId;
        request.assignedProfessionalId = professionalId;
        await manager.save(request);
        await this.auditService.record(
          {
            actor,
            action: AuditAction.HISTORY_EXPORT_REASSIGN,
            resourceType: 'history_export_request',
            resourceId: id,
            patientId: request.patientId,
            metadata: {
              fromProfessionalId: from,
              toProfessionalId: professionalId,
            },
          },
          manager,
        );
      });
      return (await this.viewsByIds([id]))[0];
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'HistoryExportsService.reassign',
        'Error al reasignar el pedido de copia',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------ listados

  /** `open`: solo los que siguen corriendo contra el plazo. */
  async list(scope: 'open' | 'all', professionalId?: number) {
    const where: Record<string, unknown> = {};
    if (professionalId) where.assignedProfessionalId = professionalId;
    if (scope === 'open') where.status = In([...OPEN_STATUSES]);
    const rows = await this.requests.find({
      where,
      order: scope === 'open' ? { dueAt: 'ASC' } : { requestedAt: 'DESC' },
      take: 200,
    });
    return this.toViews(rows);
  }

  async summary(professionalId?: number): Promise<HistoryExportSummary> {
    const query = this.requests
      .createQueryBuilder('r')
      .where('r.status IN (:...open)', { open: [...OPEN_STATUSES] });
    if (professionalId) {
      query.andWhere('r.assignedProfessionalId = :professionalId', {
        professionalId,
      });
    }
    const rows = await query.select(['r.id', 'r.dueAt']).getMany();
    const now = Date.now();
    const dues = rows.map((r) => r.dueAt.getTime()).sort((a, b) => a - b);
    return {
      open: rows.length,
      overdue: dues.filter((d) => d < now).length,
      nextDueAt: dues.length ? new Date(dues[0]) : null,
      nextMinutesLeft: dues.length
        ? Math.floor((dues[0] - now) / 60_000)
        : null,
    };
  }

  // -------------------------------------------------------------------- médico

  /** Perfil profesional del médico logueado (solo él ve y emite sus pedidos). */
  async myProfessionalId(actor: Actor): Promise<number> {
    return (await this.clinicalAccess.requireProfessional(actor)).id;
  }

  /**
   * Genera la copia en PDF. Exige que el pedido sea del médico logueado y
   * que tenga relación con el paciente (ClinicalAccessService). El PDF no se
   * guarda: se devuelve y solo quedan sus huellas y la auditoría (sin
   * contenido clínico). Si la auditoría o el registro fallan, no se entrega.
   */
  async issue(id: number, actor: Actor): Promise<IssuedHistoryPdf> {
    try {
      const professional = await this.clinicalAccess.requireProfessional(actor);
      const request = await this.requests.findOneBy({ id });
      // un pedido ajeno responde igual que uno inexistente
      if (!request || request.assignedProfessionalId !== professional.id) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (!OPEN_STATUSES.includes(request.status as never)) {
        throw new ConflictException(
          'Este pedido ya no admite emitir la copia.',
        );
      }
      await this.clinicalAccess.assertPatientAccess(
        actor,
        request.patientId,
        AuditAction.HISTORY_EXPORT_ISSUE,
        { type: 'history_export_request', id },
      );

      const patient = await this.dataSource
        .getRepository(PatientEntity)
        .findOneByOrFail({ id: request.patientId });
      const consultations =
        await this.consultationsService.loadFinalizedForExport(patient.id);
      const settings = await this.settingsService.get();
      const issuedAt = new Date();

      const authorIds = [
        ...new Set(
          consultations.flatMap((c) => c.amendments.map((a) => a.authorUserId)),
        ),
      ];
      const authors = authorIds.length
        ? await this.dataSource
            .getRepository(UserEntity)
            .find({ where: { idUser: In(authorIds) }, withDeleted: true })
        : [];
      const authorNames = new Map(
        authors.map((u) => [u.idUser, `${u.nombre} ${u.apellido}`]),
      );

      const buffer = await buildHistoryPdf({
        clinicName: settings.clinicName,
        contactPhone: settings.contactPhone,
        requestId: id,
        issuedAt,
        issuedBy: {
          name: `${professional.user.nombre} ${professional.user.apellido}`,
          licenseNumber: professional.licenseNumber,
          specialties: professional.specialties.map((s) => s.name),
        },
        patient: {
          fullName: `${patient.firstName} ${patient.lastName}`,
          documentNumber: patient.documentNumber,
          birthDate: patient.birthDate,
        },
        consultations,
        authorNames,
      });
      const pdfHash = sha256Hex(buffer);
      const chainHash = computeChainHash(
        consultations.map((c) => c.contentHash ?? ''),
      );

      await this.dataSource.transaction(async (manager) => {
        const locked = await this.lockOrFail(manager, id);
        if (!OPEN_STATUSES.includes(locked.status as never)) {
          throw new ConflictException(
            'Este pedido ya no admite emitir la copia.',
          );
        }
        locked.status = HistoryExportStatus.EMITIDA;
        locked.issuedAt = issuedAt;
        locked.issuedByUserId = actor.userId;
        locked.issueCount += 1;
        locked.consultationsCount = consultations.length;
        locked.chainHash = chainHash;
        locked.pdfHash = pdfHash;
        await manager.save(locked);
        await this.auditService.record(
          {
            actor,
            action: AuditAction.HISTORY_EXPORT_ISSUE,
            resourceType: 'history_export_request',
            resourceId: id,
            patientId: patient.id,
            metadata: {
              consultations: consultations.length,
              issueCount: locked.issueCount,
              chainHash,
              pdfHash,
            },
          },
          manager,
        );
      });
      return { buffer, filename: `historia-clinica-solicitud-${id}.pdf` };
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'HistoryExportsService.issue',
        'Error al generar la copia de la historia clínica',
        { id },
      );
    }
  }

  /** El médico confirma que entregó la copia: cierra el pedido. */
  async deliver(id: number, actor: Actor): Promise<HistoryExportView> {
    try {
      const professional = await this.clinicalAccess.requireProfessional(actor);
      await this.dataSource.transaction(async (manager) => {
        const request = await this.lockOrFail(manager, id);
        if (request.assignedProfessionalId !== professional.id) {
          throw new NotFoundException('Pedido no encontrado');
        }
        if (request.status !== HistoryExportStatus.EMITIDA) {
          throw new ConflictException(
            'Primero tenés que generar la copia para poder marcarla como entregada.',
          );
        }
        request.status = HistoryExportStatus.ENTREGADA;
        request.deliveredAt = new Date();
        request.deliveredByUserId = actor.userId;
        await manager.save(request);
        await this.auditService.record(
          {
            actor,
            action: AuditAction.HISTORY_EXPORT_DELIVER,
            resourceType: 'history_export_request',
            resourceId: id,
            patientId: request.patientId,
            metadata: { pdfHash: request.pdfHash },
          },
          manager,
        );
      });
      return (await this.viewsByIds([id]))[0];
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'HistoryExportsService.deliver',
        'Error al marcar la copia como entregada',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------ internos

  /** El médico tiene que estar activo y haber atendido al paciente. */
  private async assertAssignable(professionalId: number, patientId: number) {
    const professional =
      await this.professionalsService.findEntityById(professionalId);
    if (
      !professional.active ||
      !(await this.clinicalAccess.hasRelation(professional.id, patientId))
    ) {
      throw new BadRequestException(NO_RELATION_MESSAGE);
    }
  }

  private async lockOrFail(
    manager: import('typeorm').EntityManager,
    id: number,
  ): Promise<HistoryExportRequestEntity> {
    const request = await manager
      .getRepository(HistoryExportRequestEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!request) throw new NotFoundException('Pedido no encontrado');
    return request;
  }

  private async viewsByIds(ids: number[]) {
    return this.toViews(await this.requests.find({ where: { id: In(ids) } }));
  }

  private async toViews(
    rows: HistoryExportRequestEntity[],
  ): Promise<HistoryExportView[]> {
    if (!rows.length) return [];
    const patients = await this.dataSource
      .getRepository(PatientEntity)
      .find({ where: { id: In([...new Set(rows.map((r) => r.patientId))]) } });
    const professionals = await this.dataSource
      .getRepository(ProfessionalEntity)
      .find({
        where: {
          id: In([...new Set(rows.map((r) => r.assignedProfessionalId))]),
        },
        relations: { user: true },
      });
    const now = Date.now();
    return rows.map((r) => {
      const patient = patients.find((p) => p.id === r.patientId)!;
      const professional = professionals.find(
        (p) => p.id === r.assignedProfessionalId,
      )!;
      const running = OPEN_STATUSES.includes(r.status as never);
      const minutesLeft = running
        ? Math.floor((r.dueAt.getTime() - now) / 60_000)
        : null;
      return {
        id: r.id,
        status: r.status,
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          documentNumber: patient.documentNumber,
        },
        requesterType: r.requesterType,
        requesterName: r.requesterName,
        requesterDocument: r.requesterDocument,
        requesterRelationship: r.requesterRelationship,
        professional: {
          id: professional.id,
          firstName: professional.user.nombre,
          lastName: professional.user.apellido,
        },
        requestedAt: r.requestedAt,
        dueAt: r.dueAt,
        minutesLeft,
        overdue: minutesLeft !== null && minutesLeft < 0,
        issuedAt: r.issuedAt,
        issueCount: r.issueCount,
        consultationsCount: r.consultationsCount,
        deliveredAt: r.deliveredAt,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
      };
    });
  }
}
