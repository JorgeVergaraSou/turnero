import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { SpecialtyEntity } from './entities/specialty.entity';
import { CreateSpecialtyDto, UpdateSpecialtyDto } from './dto/specialty.dto';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { specialtiesErrorLogger } from '@/config/module-loggers';

@Injectable()
export class SpecialtiesService {
  constructor(
    @InjectRepository(SpecialtyEntity)
    private readonly specialtyRepository: Repository<SpecialtyEntity>,
    private readonly auditService: AuditService,
  ) {}

  /** admin: todas, incluidas las desactivadas */
  async findAll(): Promise<SpecialtyEntity[]> {
    try {
      return await this.specialtyRepository.find({ order: { name: 'ASC' } });
    } catch (error) {
      handleServiceError(
        error,
        specialtiesErrorLogger,
        'SpecialtiesService.findAll',
        'Error al buscar las especialidades',
      );
    }
  }

  /** público: solo activas */
  async findActive(): Promise<SpecialtyEntity[]> {
    try {
      return await this.specialtyRepository.find({
        where: { active: true },
        order: { name: 'ASC' },
      });
    } catch (error) {
      handleServiceError(
        error,
        specialtiesErrorLogger,
        'SpecialtiesService.findActive',
        'Error al buscar las especialidades',
      );
    }
  }

  /** Devuelve las especialidades pedidas, exigiendo que existan todas y
   * estén activas (usado al asignar especialidades a un profesional). */
  async findActiveByIds(ids: number[]): Promise<SpecialtyEntity[]> {
    const uniqueIds = [...new Set(ids)];
    const specialties = await this.specialtyRepository.findBy({
      id: In(uniqueIds),
      active: true,
    });
    if (specialties.length !== uniqueIds.length) {
      throw new NotFoundException(
        'Alguna de las especialidades no existe o está desactivada',
      );
    }
    return specialties;
  }

  async create(
    dto: CreateSpecialtyDto,
    actor: Actor,
  ): Promise<SpecialtyEntity> {
    try {
      await this.assertNameAvailable(dto.name);
      const specialty = await this.specialtyRepository.save(
        this.specialtyRepository.create({
          name: dto.name,
          description: dto.description ?? null,
        }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.SPECIALTY_CREATE,
        resourceType: 'specialty',
        resourceId: specialty.id,
      });
      return specialty;
    } catch (error) {
      handleServiceError(
        error,
        specialtiesErrorLogger,
        'SpecialtiesService.create',
        'Error al crear la especialidad',
      );
    }
  }

  async update(
    id: number,
    dto: UpdateSpecialtyDto,
    actor: Actor,
  ): Promise<SpecialtyEntity> {
    try {
      const specialty = await this.specialtyRepository.findOneBy({ id });
      if (!specialty) {
        throw new NotFoundException('Especialidad no encontrada');
      }
      if (dto.name !== undefined && dto.name !== specialty.name) {
        await this.assertNameAvailable(dto.name, id);
      }

      this.specialtyRepository.merge(specialty, dto);
      const saved = await this.specialtyRepository.save(specialty);

      await this.auditService.record({
        actor,
        action: AuditAction.SPECIALTY_UPDATE,
        resourceType: 'specialty',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        specialtiesErrorLogger,
        'SpecialtiesService.update',
        'Error al actualizar la especialidad',
        { id },
      );
    }
  }

  private async assertNameAvailable(name: string, exceptId?: number) {
    const exists = await this.specialtyRepository.exists({
      where: exceptId ? { name, id: Not(exceptId) } : { name },
    });
    if (exists) {
      throw new ConflictException('Ya existe una especialidad con ese nombre');
    }
  }
}
