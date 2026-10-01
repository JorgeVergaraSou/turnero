import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { ScheduleEntity } from './entities/schedule.entity';
import { ScheduleExceptionEntity } from './entities/schedule-exception.entity';
import {
  CreateScheduleDto,
  CreateScheduleExceptionDto,
  UpdateScheduleDto,
  UpdateScheduleExceptionDto,
} from './dto/schedule.dto';
import { ScheduleExceptionType } from './scheduling.enums';
import { ExceptionRule, ScheduleRule } from './availability.calculator';
import { ProfessionalsService } from '@/professionals/professionals.service';
import { OfficesService } from '@/offices/offices.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { normalizeTime } from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { schedulingErrorLogger } from '@/config/module-loggers';

@Injectable()
export class SchedulingService {
  constructor(
    @InjectRepository(ScheduleEntity)
    private readonly scheduleRepository: Repository<ScheduleEntity>,
    @InjectRepository(ScheduleExceptionEntity)
    private readonly exceptionRepository: Repository<ScheduleExceptionEntity>,
    private readonly professionalsService: ProfessionalsService,
    private readonly officesService: OfficesService,
    private readonly auditService: AuditService,
  ) {}

  // ------------------------------------------------------------------
  // Horarios
  // ------------------------------------------------------------------

  async findSchedules(professionalId?: number): Promise<ScheduleEntity[]> {
    try {
      return await this.scheduleRepository.find({
        where: professionalId ? { professionalId } : {},
        relations: { office: true },
        order: { professionalId: 'ASC', weekday: 'ASC', startTime: 'ASC' },
      });
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.findSchedules',
        'Error al buscar los horarios',
        { professionalId },
      );
    }
  }

  async createSchedule(
    dto: CreateScheduleDto,
    actor: Actor,
  ): Promise<ScheduleEntity> {
    try {
      await this.professionalsService.findEntityById(dto.professionalId);
      await this.officesService.findActiveById(dto.officeId);

      const candidate = this.scheduleRepository.create({
        professionalId: dto.professionalId,
        officeId: dto.officeId,
        weekday: dto.weekday,
        startTime: normalizeTime(dto.startTime),
        endTime: normalizeTime(dto.endTime),
        slotMinutes: dto.slotMinutes,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil ?? null,
        active: true,
      });
      this.assertScheduleShape(candidate);
      await this.assertNoScheduleOverlap(candidate);

      const saved = await this.scheduleRepository.save(candidate);
      await this.auditService.record({
        actor,
        action: AuditAction.SCHEDULE_CREATE,
        resourceType: 'schedule',
        resourceId: saved.id,
        metadata: { professionalId: saved.professionalId },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.createSchedule',
        'Error al crear el horario',
        { professionalId: dto.professionalId },
      );
    }
  }

  async updateSchedule(
    id: number,
    dto: UpdateScheduleDto,
    actor: Actor,
  ): Promise<ScheduleEntity> {
    try {
      const schedule = await this.scheduleRepository.findOneBy({ id });
      if (!schedule) {
        throw new NotFoundException('Horario no encontrado');
      }
      if (dto.officeId !== undefined && dto.officeId !== schedule.officeId) {
        await this.officesService.findActiveById(dto.officeId);
      }

      this.scheduleRepository.merge(schedule, {
        ...dto,
        ...(dto.startTime && { startTime: normalizeTime(dto.startTime) }),
        ...(dto.endTime && { endTime: normalizeTime(dto.endTime) }),
      });
      this.assertScheduleShape(schedule);
      if (schedule.active) {
        await this.assertNoScheduleOverlap(schedule);
      }

      const saved = await this.scheduleRepository.save(schedule);
      await this.auditService.record({
        actor,
        action: AuditAction.SCHEDULE_UPDATE,
        resourceType: 'schedule',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.updateSchedule',
        'Error al actualizar el horario',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------
  // Excepciones
  // ------------------------------------------------------------------

  async findExceptions(filters: {
    professionalId?: number;
    from?: string;
    to?: string;
  }): Promise<ScheduleExceptionEntity[]> {
    try {
      const query = this.exceptionRepository
        .createQueryBuilder('exception')
        .leftJoinAndSelect('exception.office', 'office')
        .orderBy('exception.startDate', 'ASC');
      if (filters.professionalId) {
        // las globales (feriados) también afectan a este profesional
        query.andWhere(
          '(exception.professionalId = :professionalId OR exception.professionalId IS NULL)',
          { professionalId: filters.professionalId },
        );
      }
      if (filters.from) {
        query.andWhere('exception.endDate >= :from', { from: filters.from });
      }
      if (filters.to) {
        query.andWhere('exception.startDate <= :to', { to: filters.to });
      }
      return await query.getMany();
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.findExceptions',
        'Error al buscar las excepciones de agenda',
        filters,
      );
    }
  }

  async createException(
    dto: CreateScheduleExceptionDto,
    actor: Actor,
  ): Promise<ScheduleExceptionEntity> {
    try {
      if (dto.startDate > dto.endDate) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser posterior a la de fin',
        );
      }
      const hasStart = dto.startTime !== undefined;
      const hasEnd = dto.endTime !== undefined;
      if (hasStart !== hasEnd) {
        throw new BadRequestException(
          'Indique hora de inicio y de fin, o ninguna (días completos)',
        );
      }
      if (hasStart && dto.startTime! >= dto.endTime!) {
        throw new BadRequestException(
          'La hora de inicio debe ser anterior a la de fin',
        );
      }

      const isSpecial = dto.type === ScheduleExceptionType.HORARIO_ESPECIAL;
      if (isSpecial) {
        if (
          !dto.professionalId ||
          !hasStart ||
          !dto.officeId ||
          !dto.slotMinutes
        ) {
          throw new BadRequestException(
            'Un horario especial requiere profesional, horario, consultorio y duración de turno',
          );
        }
        await this.officesService.findActiveById(dto.officeId);
      } else if (dto.officeId !== undefined || dto.slotMinutes !== undefined) {
        throw new BadRequestException(
          'Consultorio y duración solo aplican a un horario especial',
        );
      }
      if (dto.professionalId) {
        await this.professionalsService.findEntityById(dto.professionalId);
      }

      const saved = await this.exceptionRepository.save(
        this.exceptionRepository.create({
          professionalId: dto.professionalId ?? null,
          type: dto.type,
          startDate: dto.startDate,
          endDate: dto.endDate,
          startTime: hasStart ? normalizeTime(dto.startTime!) : null,
          endTime: hasEnd ? normalizeTime(dto.endTime!) : null,
          officeId: isSpecial ? dto.officeId! : null,
          slotMinutes: isSpecial ? dto.slotMinutes! : null,
          reason: dto.reason ?? null,
          createdByUserId: actor.userId!,
        }),
      );
      await this.auditService.record({
        actor,
        action: AuditAction.SCHEDULE_EXCEPTION_CREATE,
        resourceType: 'schedule_exception',
        resourceId: saved.id,
        metadata: { type: saved.type, professionalId: saved.professionalId },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.createException',
        'Error al crear la excepción de agenda',
      );
    }
  }

  async updateException(
    id: number,
    dto: UpdateScheduleExceptionDto,
    actor: Actor,
  ): Promise<ScheduleExceptionEntity> {
    try {
      const exception = await this.exceptionRepository.findOneBy({ id });
      if (!exception) {
        throw new NotFoundException('Excepción no encontrada');
      }
      exception.active = dto.active;
      const saved = await this.exceptionRepository.save(exception);
      await this.auditService.record({
        actor,
        action: AuditAction.SCHEDULE_EXCEPTION_UPDATE,
        resourceType: 'schedule_exception',
        resourceId: id,
        metadata: { active: dto.active },
      });
      return saved;
    } catch (error) {
      handleServiceError(
        error,
        schedulingErrorLogger,
        'SchedulingService.updateException',
        'Error al actualizar la excepción de agenda',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------
  // Reglas para el cálculo de disponibilidad
  // ------------------------------------------------------------------

  /** Horarios y excepciones activos de un profesional que tocan [from, to].
   * Con `manager`, lee dentro de la transacción de una reserva. */
  async getRules(
    professionalId: number,
    from: string,
    to: string,
    manager?: EntityManager,
  ): Promise<{ schedules: ScheduleRule[]; exceptions: ExceptionRule[] }> {
    const scheduleRepo = manager
      ? manager.getRepository(ScheduleEntity)
      : this.scheduleRepository;
    const exceptionRepo = manager
      ? manager.getRepository(ScheduleExceptionEntity)
      : this.exceptionRepository;

    const schedules = await scheduleRepo
      .createQueryBuilder('schedule')
      .innerJoin('schedule.office', 'office', 'office.active = 1')
      .where('schedule.professionalId = :professionalId', { professionalId })
      .andWhere('schedule.active = 1')
      .andWhere('schedule.validFrom <= :to', { to })
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('schedule.validUntil IS NULL')
            .orWhere('schedule.validUntil >= :from', { from }),
        ),
      )
      .getMany();

    const exceptions = await exceptionRepo
      .createQueryBuilder('exception')
      .leftJoin('exception.office', 'office')
      .where(
        '(exception.professionalId = :professionalId OR exception.professionalId IS NULL)',
        { professionalId },
      )
      .andWhere('exception.active = 1')
      .andWhere('exception.startDate <= :to', { to })
      .andWhere('exception.endDate >= :from', { from })
      // un horario especial en un consultorio desactivado no suma disponibilidad
      .andWhere('(exception.officeId IS NULL OR office.active = 1)')
      .getMany();

    return {
      schedules: schedules.map((s) => ({
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        slotMinutes: s.slotMinutes,
        officeId: s.officeId,
        validFrom: s.validFrom,
        validUntil: s.validUntil,
      })),
      exceptions: exceptions.map((e) => ({
        type: e.type,
        startDate: e.startDate,
        endDate: e.endDate,
        startTime: e.startTime,
        endTime: e.endTime,
        officeId: e.officeId,
        slotMinutes: e.slotMinutes,
      })),
    };
  }

  // ------------------------------------------------------------------

  private assertScheduleShape(schedule: ScheduleEntity) {
    if (schedule.startTime >= schedule.endTime) {
      throw new BadRequestException(
        'La hora de inicio debe ser anterior a la de fin',
      );
    }
    if (schedule.validUntil && schedule.validUntil < schedule.validFrom) {
      throw new BadRequestException(
        'La vigencia hasta no puede ser anterior a la vigencia desde',
      );
    }
  }

  /**
   * Un profesional no puede tener dos horarios activos que se pisen (mismo
   * día, horas y vigencias superpuestas), y un consultorio no puede estar
   * asignado a dos profesionales distintos en la misma franja.
   */
  private async assertNoScheduleOverlap(schedule: ScheduleEntity) {
    const overlapping = await this.scheduleRepository
      .createQueryBuilder('other')
      .where('other.active = 1')
      .andWhere('other.weekday = :weekday', { weekday: schedule.weekday })
      .andWhere('other.startTime < :endTime', { endTime: schedule.endTime })
      .andWhere('other.endTime > :startTime', {
        startTime: schedule.startTime,
      })
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('other.validUntil IS NULL')
            .orWhere('other.validUntil >= :validFrom', {
              validFrom: schedule.validFrom,
            }),
        ),
      )
      .andWhere(
        schedule.validUntil ? 'other.validFrom <= :validUntil' : '1 = 1',
        { validUntil: schedule.validUntil },
      )
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('other.professionalId = :professionalId', {
              professionalId: schedule.professionalId,
            })
            .orWhere('other.officeId = :officeId', {
              officeId: schedule.officeId,
            }),
        ),
      )
      .andWhere(schedule.id ? 'other.id <> :id' : '1 = 1', { id: schedule.id })
      .getOne();

    if (overlapping) {
      throw new ConflictException(
        overlapping.professionalId === schedule.professionalId
          ? 'El profesional ya tiene un horario que se superpone con este'
          : 'El consultorio ya está asignado a otro profesional en esa franja',
      );
    }
  }
}
