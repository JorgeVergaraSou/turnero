import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PrivacyNoticeEntity } from './entities/privacy-notice.entity';
import {
  ConsentChannel,
  PrivacyConsentEntity,
} from './entities/privacy-consent.entity';
import { PublishPrivacyNoticeDto } from './dto/publish-privacy-notice.dto';
import { computeNoticeHash } from './privacy-notice.util';
import { UserEntity } from '@/users/entities/user.entity';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { privacyErrorLogger } from '@/config/module-loggers';

/** Lo que ve cualquiera (reserva y página pública /privacidad). */
export interface PublicPrivacyNotice {
  version: number;
  summary: string;
  policy: string;
  /** true = texto en revisión legal (se avisa en pantalla) */
  draft: boolean;
  publishedAt: Date;
}

/** Una versión tal como la ve el administrador. */
export interface AdminPrivacyNotice extends PublicPrivacyNotice {
  author: string | null;
}

export const STALE_NOTICE_MESSAGE =
  'El aviso de privacidad cambió. Leelo y aceptalo de nuevo para continuar.';

const toPublic = (n: PrivacyNoticeEntity): PublicPrivacyNotice => ({
  version: n.version,
  summary: n.summary,
  policy: n.policy,
  draft: n.isDraft,
  publishedAt: n.createdAt,
});

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(PrivacyNoticeEntity)
    private readonly notices: Repository<PrivacyNoticeEntity>,
    private readonly auditService: AuditService,
  ) {}

  /** La versión vigente es la más alta. Nunca se cachea: un cambio rige al instante. */
  async getCurrentEntity(): Promise<PrivacyNoticeEntity> {
    const current = await this.notices.findOne({
      where: {},
      order: { version: 'DESC' },
    });
    if (!current) {
      throw new Error('No hay ninguna versión del aviso de privacidad');
    }
    return current;
  }

  async getCurrent(): Promise<PublicPrivacyNotice> {
    try {
      return toPublic(await this.getCurrentEntity());
    } catch (error) {
      handleServiceError(
        error,
        privacyErrorLogger,
        'PrivacyService.getCurrent',
        'No se pudo leer el aviso de privacidad',
      );
    }
  }

  /**
   * El backend es quien decide: la reserva solo vale si trae la versión
   * VIGENTE. Con una versión vieja (el aviso cambió mientras la persona
   * llenaba el formulario) responde 409 y el frontend pide leerlo de nuevo.
   */
  async assertCurrentVersion(version: number): Promise<PrivacyNoticeEntity> {
    const current = await this.getCurrentEntity();
    if (current.version !== version) {
      throw new ConflictException(STALE_NOTICE_MESSAGE);
    }
    return current;
  }

  /** Guarda la constancia, dentro de la transacción de la reserva. */
  async recordConsent(
    manager: EntityManager,
    input: {
      appointmentId: number;
      patientId: number;
      notice: PrivacyNoticeEntity;
      channel: ConsentChannel;
      recordedByUserId: number | null;
    },
  ): Promise<void> {
    await manager.getRepository(PrivacyConsentEntity).insert({
      appointmentId: input.appointmentId,
      patientId: input.patientId,
      noticeVersion: input.notice.version,
      noticeHash: input.notice.contentHash,
      channel: input.channel,
      recordedByUserId: input.recordedByUserId,
      acceptedAt: new Date(),
    });
  }

  /** Todas las versiones, la más nueva primero (pantalla del administrador). */
  async list(): Promise<AdminPrivacyNotice[]> {
    try {
      const rows = await this.notices
        .createQueryBuilder('n')
        .leftJoin(UserEntity, 'u', 'u.idUser = n.createdByUserId')
        .select([
          'n.version AS version',
          'n.summary AS summary',
          'n.policy AS policy',
          'n.isDraft AS draft',
          'n.createdAt AS publishedAt',
        ])
        .addSelect('u.nombre', 'firstName')
        .addSelect('u.apellido', 'lastName')
        .orderBy('n.version', 'DESC')
        .getRawMany<{
          version: number;
          summary: string;
          policy: string;
          draft: number | boolean;
          publishedAt: Date;
          firstName: string | null;
          lastName: string | null;
        }>();
      return rows.map((r) => ({
        version: Number(r.version),
        summary: r.summary,
        policy: r.policy,
        draft: Boolean(r.draft),
        publishedAt: r.publishedAt,
        author:
          r.firstName || r.lastName
            ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()
            : null,
      }));
    } catch (error) {
      handleServiceError(
        error,
        privacyErrorLogger,
        'PrivacyService.list',
        'No se pudieron leer las versiones del aviso',
      );
    }
  }

  /** Publica una versión NUEVA (la vigente pasa a ser esta). Exige que haya algo distinto. */
  async publish(
    dto: PublishPrivacyNoticeDto,
    actor: Actor,
  ): Promise<PublicPrivacyNotice> {
    try {
      const current = await this.getCurrentEntity();
      const contentHash = computeNoticeHash(dto.summary, dto.policy);
      if (
        current.contentHash === contentHash &&
        current.isDraft === dto.isDraft
      ) {
        // no se crea una versión idéntica: obligaría a todos a aceptar de nuevo sin motivo
        throw new ConflictException(
          'No hay cambios respecto de la versión vigente.',
        );
      }
      const saved = await this.notices.save(
        this.notices.create({
          summary: dto.summary,
          policy: dto.policy,
          isDraft: dto.isDraft,
          contentHash,
          createdByUserId: actor.userId,
          createdAt: new Date(),
        }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.PRIVACY_NOTICE_PUBLISH,
        resourceType: 'privacy_notice',
        resourceId: saved.version,
        metadata: { isDraft: dto.isDraft },
      });
      return toPublic(saved);
    } catch (error) {
      handleServiceError(
        error,
        privacyErrorLogger,
        'PrivacyService.publish',
        'No se pudo publicar el aviso de privacidad',
      );
    }
  }
}
