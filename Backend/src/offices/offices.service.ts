import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { OfficeEntity } from './entities/office.entity';
import { CreateOfficeDto, UpdateOfficeDto } from './dto/office.dto';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { officesErrorLogger } from '@/config/module-loggers';

@Injectable()
export class OfficesService {
  constructor(
    @InjectRepository(OfficeEntity)
    private readonly officeRepository: Repository<OfficeEntity>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<OfficeEntity[]> {
    try {
      return await this.officeRepository.find({ order: { name: 'ASC' } });
    } catch (error) {
      handleServiceError(
        error,
        officesErrorLogger,
        'OfficesService.findAll',
        'Error al buscar los consultorios',
      );
    }
  }

  /** Exige que exista y esté activo (usado al cargar horarios). */
  async findActiveById(id: number): Promise<OfficeEntity> {
    const office = await this.officeRepository.findOneBy({ id, active: true });
    if (!office) {
      throw new NotFoundException(
        'El consultorio no existe o está desactivado',
      );
    }
    return office;
  }

  async create(dto: CreateOfficeDto, actor: Actor): Promise<OfficeEntity> {
    try {
      await this.assertNameAvailable(dto.name);
      const office = await this.officeRepository.save(
        this.officeRepository.create({
          name: dto.name,
          address: dto.address,
          locationDetails: dto.locationDetails ?? null,
          phone: dto.phone ?? null,
        }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.OFFICE_CREATE,
        resourceType: 'office',
        resourceId: office.id,
      });
      return office;
    } catch (error) {
      handleServiceError(
        error,
        officesErrorLogger,
        'OfficesService.create',
        'Error al crear el consultorio',
      );
    }
  }

  async update(
    id: number,
    dto: UpdateOfficeDto,
    actor: Actor,
  ): Promise<OfficeEntity> {
    try {
      const office = await this.officeRepository.findOneBy({ id });
      if (!office) {
        throw new NotFoundException('Consultorio no encontrado');
      }
      if (dto.name !== undefined && dto.name !== office.name) {
        await this.assertNameAvailable(dto.name, id);
      }

      this.officeRepository.merge(office, dto);
      const saved = await this.officeRepository.save(office);

      await this.auditService.record({
        actor,
        action: AuditAction.OFFICE_UPDATE,
        resourceType: 'office',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        officesErrorLogger,
        'OfficesService.update',
        'Error al actualizar el consultorio',
        { id },
      );
    }
  }

  private async assertNameAvailable(name: string, exceptId?: number) {
    const exists = await this.officeRepository.exists({
      where: exceptId ? { name, id: Not(exceptId) } : { name },
    });
    if (exists) {
      throw new ConflictException('Ya existe un consultorio con ese nombre');
    }
  }
}
