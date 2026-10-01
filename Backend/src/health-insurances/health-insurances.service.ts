import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { HealthInsuranceEntity } from './entities/health-insurance.entity';
import {
  CreateHealthInsuranceDto,
  UpdateHealthInsuranceDto,
} from './dto/health-insurance.dto';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { healthInsurancesErrorLogger } from '@/config/module-loggers';

@Injectable()
export class HealthInsurancesService {
  constructor(
    @InjectRepository(HealthInsuranceEntity)
    private readonly repository: Repository<HealthInsuranceEntity>,
    private readonly auditService: AuditService,
  ) {}

  /** personal: todas, incluidas las desactivadas (un legajo viejo puede
   * seguir apuntando a una) */
  async findAll(): Promise<HealthInsuranceEntity[]> {
    try {
      return await this.repository.find({ order: { name: 'ASC' } });
    } catch (error) {
      handleServiceError(
        error,
        healthInsurancesErrorLogger,
        'HealthInsurancesService.findAll',
        'Error al buscar las obras sociales',
      );
    }
  }

  /** público: solo activas */
  async findActive(): Promise<HealthInsuranceEntity[]> {
    try {
      return await this.repository.find({
        where: { active: true },
        order: { name: 'ASC' },
      });
    } catch (error) {
      handleServiceError(
        error,
        healthInsurancesErrorLogger,
        'HealthInsurancesService.findActive',
        'Error al buscar las obras sociales',
      );
    }
  }

  /** Exige que la obra social exista y esté activa (al asignarla a un
   * paciente o declararla en una reserva). null = particular: siempre vale. */
  async assertAssignable(
    id: number | null | undefined,
    manager?: EntityManager,
  ): Promise<void> {
    if (id === null || id === undefined) return;
    const repository = manager
      ? manager.getRepository(HealthInsuranceEntity)
      : this.repository;
    if (!(await repository.exists({ where: { id, active: true } }))) {
      throw new BadRequestException(
        'La obra social elegida no existe o ya no se atiende',
      );
    }
  }

  async create(
    dto: CreateHealthInsuranceDto,
    actor: Actor,
  ): Promise<HealthInsuranceEntity> {
    try {
      await this.assertNameAvailable(dto.name);
      const saved = await this.repository.save(
        this.repository.create({ name: dto.name }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.HEALTH_INSURANCE_CREATE,
        resourceType: 'health_insurance',
        resourceId: saved.id,
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        healthInsurancesErrorLogger,
        'HealthInsurancesService.create',
        'Error al crear la obra social',
      );
    }
  }

  async update(
    id: number,
    dto: UpdateHealthInsuranceDto,
    actor: Actor,
  ): Promise<HealthInsuranceEntity> {
    try {
      const entity = await this.repository.findOneBy({ id });
      if (!entity) {
        throw new NotFoundException('Obra social no encontrada');
      }
      if (dto.name !== undefined && dto.name !== entity.name) {
        await this.assertNameAvailable(dto.name, id);
      }
      this.repository.merge(entity, dto);
      const saved = await this.repository.save(entity);
      await this.auditService.record({
        actor,
        action: AuditAction.HEALTH_INSURANCE_UPDATE,
        resourceType: 'health_insurance',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        healthInsurancesErrorLogger,
        'HealthInsurancesService.update',
        'Error al actualizar la obra social',
        { id },
      );
    }
  }

  private async assertNameAvailable(name: string, exceptId?: number) {
    const exists = await this.repository.exists({
      where: exceptId ? { name, id: Not(exceptId) } : { name },
    });
    if (exists) {
      throw new ConflictException('Ya existe una obra social con ese nombre');
    }
  }
}
