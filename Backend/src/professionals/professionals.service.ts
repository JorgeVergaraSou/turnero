import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { ProfessionalEntity } from './entities/professional.entity';
import {
  CreateProfessionalDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import {
  ProfessionalResponseDto,
  PublicProfessionalResponseDto,
} from './dto/professional-response.dto';
import { UserEntity } from '@/users/entities/user.entity';
import { UsersService } from '@/users/users.service';
import { SpecialtiesService } from '@/specialties/specialties.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { Role } from '@/common/enums/role.enum';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { professionalsErrorLogger } from '@/config/module-loggers';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(ProfessionalEntity)
    private readonly professionalRepository: Repository<ProfessionalEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly specialtiesService: SpecialtiesService,
    private readonly auditService: AuditService,
  ) {}

  /** admin: todos, incluidos inactivos y los de usuarios dados de baja */
  async findAll(): Promise<ProfessionalResponseDto[]> {
    try {
      const professionals = await this.professionalRepository
        .createQueryBuilder('professional')
        .withDeleted() // incluye usuarios dados de baja, para mostrarlos como tales
        .innerJoinAndSelect('professional.user', 'user')
        .leftJoinAndSelect('professional.specialties', 'specialty')
        .orderBy('user.apellido', 'ASC')
        .addOrderBy('user.nombre', 'ASC')
        .getMany();
      return professionals.map((p) => ProfessionalResponseDto.from(p));
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.findAll',
        'Error al buscar los profesionales',
      );
    }
  }

  async findOne(id: number): Promise<ProfessionalResponseDto> {
    try {
      const professional = await this.professionalRepository
        .createQueryBuilder('professional')
        .withDeleted()
        .innerJoinAndSelect('professional.user', 'user')
        .leftJoinAndSelect('professional.specialties', 'specialty')
        .where('professional.id = :id', { id })
        .getOne();
      if (!professional) {
        throw new NotFoundException('Profesional no encontrado');
      }
      return ProfessionalResponseDto.from(professional);
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.findOne',
        'Error al buscar el profesional',
        { id },
      );
    }
  }

  /** Público: profesionales que hoy pueden recibir turnos (perfil activo y
   * usuario no dado de baja), opcionalmente filtrados por especialidad
   * activa. */
  async findBookable(
    specialtyId?: number,
  ): Promise<PublicProfessionalResponseDto[]> {
    try {
      const query = this.bookableQuery();
      if (specialtyId) {
        // filtro por subquery para no recortar la lista de especialidades
        // que se devuelve de cada profesional
        query.andWhere(
          `professional.id IN (
            SELECT ps.professional_id FROM professional_specialties ps
            WHERE ps.specialty_id = :specialtyId)`,
          { specialtyId },
        );
      }
      const professionals = await query
        .orderBy('user.apellido', 'ASC')
        .addOrderBy('user.nombre', 'ASC')
        .getMany();
      return professionals.map((p) => PublicProfessionalResponseDto.from(p));
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.findBookable',
        'Error al buscar los profesionales',
        { specialtyId },
      );
    }
  }

  /**
   * Profesional que hoy puede recibir turnos Y ejerce la especialidad
   * pedida (activa). Usado al reservar. Con `manager`, lee dentro de la
   * transacción de la reserva.
   */
  async findBookableWithSpecialty(
    professionalId: number,
    specialtyId: number,
    manager?: EntityManager,
  ): Promise<ProfessionalEntity> {
    const professional = await this.bookableQuery(manager)
      .andWhere('professional.id = :professionalId', { professionalId })
      .getOne();
    if (!professional) {
      throw new NotFoundException(
        'El profesional no existe o no está recibiendo turnos',
      );
    }
    if (!professional.specialties.some((s) => s.id === specialtyId)) {
      throw new BadRequestException(
        'El profesional no atiende la especialidad indicada',
      );
    }
    return professional;
  }

  /** Lanza 404 si el profesional no puede recibir turnos hoy (inactivo,
   * usuario dado de baja o sin especialidades activas). */
  async assertBookable(professionalId: number): Promise<void> {
    const exists = await this.bookableQuery()
      .andWhere('professional.id = :professionalId', { professionalId })
      .getExists();
    if (!exists) {
      throw new NotFoundException(
        'El profesional no existe o no está recibiendo turnos',
      );
    }
  }

  /** Perfil profesional del usuario logueado (panel médico). */
  async findByUserId(userId: number): Promise<ProfessionalEntity | null> {
    return this.professionalRepository.findOne({
      where: { userId },
      relations: { user: true, specialties: true },
    });
  }

  async findEntityById(id: number): Promise<ProfessionalEntity> {
    const professional = await this.professionalRepository.findOne({
      where: { id },
      relations: { user: true, specialties: true },
    });
    if (!professional) {
      throw new NotFoundException('Profesional no encontrado');
    }
    return professional;
  }

  /**
   * Bloquea la fila del profesional (SELECT … FOR UPDATE) dentro de la
   * transacción de una reserva. Serializa todas las reservas/reprogramaciones
   * de un mismo profesional: la segunda espera a que la primera confirme y
   * recién ahí recalcula la disponibilidad, así dos pacientes no pueden
   * tomar el mismo horario (ni horarios solapados) a la vez.
   */
  async lockForBooking(manager: EntityManager, id: number): Promise<void> {
    const locked = await manager
      .getRepository(ProfessionalEntity)
      .createQueryBuilder('professional')
      .setLock('pessimistic_write')
      .where('professional.id = :id', { id })
      .getOne();
    if (!locked) {
      throw new NotFoundException('Profesional no encontrado');
    }
  }

  /** Usuarios MEDICO activos que todavía no tienen perfil profesional. */
  async findEligibleUsers() {
    try {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .leftJoin(
          ProfessionalEntity,
          'professional',
          'professional.user_id = user.id_user',
        )
        .where('user.role = :role', { role: Role.MEDICO })
        .andWhere('professional.id IS NULL')
        .orderBy('user.apellido', 'ASC')
        .getMany();
      return users.map((user) => ({
        idUser: user.idUser,
        nickUsuario: user.nickUsuario,
        nombre: user.nombre,
        apellido: user.apellido,
      }));
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.findEligibleUsers',
        'Error al buscar los usuarios médicos',
      );
    }
  }

  async create(
    dto: CreateProfessionalDto,
    actor: Actor,
  ): Promise<ProfessionalResponseDto> {
    try {
      const user = await this.usersService.findOneById(dto.userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado o dado de baja');
      }
      if (user.role !== Role.MEDICO) {
        throw new BadRequestException(
          'Solo un usuario con rol MEDICO puede tener perfil profesional',
        );
      }
      if (
        await this.professionalRepository.exists({
          where: { userId: user.idUser },
        })
      ) {
        throw new ConflictException(
          'El usuario ya tiene un perfil profesional',
        );
      }
      await this.assertLicenseAvailable(dto.licenseNumber);
      const specialties = await this.specialtiesService.findActiveByIds(
        dto.specialtyIds,
      );

      const professional = await this.professionalRepository.save(
        this.professionalRepository.create({
          userId: user.idUser,
          licenseNumber: dto.licenseNumber,
          specialties,
        }),
      );

      await this.auditService.record({
        actor,
        action: AuditAction.PROFESSIONAL_CREATE,
        resourceType: 'professional',
        resourceId: professional.id,
        metadata: { userId: user.idUser },
      });
      return this.findOne(professional.id);
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.create',
        'Error al crear el profesional',
        { userId: dto.userId },
      );
    }
  }

  async update(
    id: number,
    dto: UpdateProfessionalDto,
    actor: Actor,
  ): Promise<ProfessionalResponseDto> {
    try {
      const professional = await this.professionalRepository.findOne({
        where: { id },
        relations: { specialties: true },
      });
      if (!professional) {
        throw new NotFoundException('Profesional no encontrado');
      }

      if (
        dto.licenseNumber !== undefined &&
        dto.licenseNumber !== professional.licenseNumber
      ) {
        await this.assertLicenseAvailable(dto.licenseNumber, id);
        professional.licenseNumber = dto.licenseNumber;
      }
      if (dto.specialtyIds !== undefined) {
        professional.specialties =
          await this.specialtiesService.findActiveByIds(dto.specialtyIds);
      }
      if (dto.active !== undefined) {
        professional.active = dto.active;
      }

      await this.professionalRepository.save(professional);
      await this.auditService.record({
        actor,
        action: AuditAction.PROFESSIONAL_UPDATE,
        resourceType: 'professional',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return this.findOne(id);
    } catch (error) {
      handleServiceError(
        error,
        professionalsErrorLogger,
        'ProfessionalsService.update',
        'Error al actualizar el profesional',
        { id },
      );
    }
  }

  /** perfil activo + usuario no dado de baja (el innerJoin excluye soft-deleted) */
  private bookableQuery(manager?: EntityManager) {
    const repository = manager
      ? manager.getRepository(ProfessionalEntity)
      : this.professionalRepository;
    return repository
      .createQueryBuilder('professional')
      .innerJoinAndSelect('professional.user', 'user')
      .innerJoinAndSelect(
        'professional.specialties',
        'specialty',
        'specialty.active = :specialtyActive',
        { specialtyActive: true },
      )
      .where('professional.active = :active', { active: true });
  }

  private async assertLicenseAvailable(
    licenseNumber: string,
    exceptId?: number,
  ) {
    const exists = await this.professionalRepository.exists({
      where: exceptId
        ? { licenseNumber, id: Not(exceptId) }
        : { licenseNumber },
    });
    if (exists) {
      throw new ConflictException('Ya existe un profesional con esa matrícula');
    }
  }
}
