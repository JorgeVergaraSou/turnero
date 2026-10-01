import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status';
import { SchedulingService } from '@/scheduling/scheduling.service';
import { SettingsService } from '@/settings/settings.service';
import {
  Slot,
  computeAvailableSlots,
} from '@/scheduling/availability.calculator';
import { MAX_AVAILABILITY_RANGE_DAYS } from '@/scheduling/scheduling.enums';
import {
  addDays,
  clinicNow,
  daysBetween,
} from '@/common/utils/clinic-time.util';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    private readonly schedulingService: SchedulingService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Horarios libres de un profesional en [from, to]: la oferta de agenda
   * (horarios + excepciones) menos los turnos vigentes, sin horarios
   * pasados ni más allá del horizonte de reserva.
   *
   * Con `manager` (reserva/reprogramación) lee dentro de la transacción,
   * DESPUÉS de haber bloqueado al profesional — así ve los turnos que otra
   * reserva concurrente acaba de confirmar.
   */
  async getAvailableSlots(
    professionalId: number,
    from: string,
    to: string,
    options: { manager?: EntityManager; excludeAppointmentId?: number } = {},
  ): Promise<Slot[]> {
    if (from > to) {
      throw new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta',
      );
    }
    if (daysBetween(from, to) >= MAX_AVAILABILITY_RANGE_DAYS) {
      throw new BadRequestException(
        `El rango de fechas no puede superar ${MAX_AVAILABILITY_RANGE_DAYS} días`,
      );
    }

    const now = clinicNow();
    const { bookingHorizonDays } = await this.settingsService.get();
    const horizon = addDays(now.date, bookingHorizonDays);
    const effectiveFrom = from < now.date ? now.date : from;
    const effectiveTo = to > horizon ? horizon : to;
    if (effectiveFrom > effectiveTo) {
      return [];
    }

    const { schedules, exceptions } = await this.schedulingService.getRules(
      professionalId,
      effectiveFrom,
      effectiveTo,
      options.manager,
    );

    const repository = options.manager
      ? options.manager.getRepository(AppointmentEntity)
      : this.appointmentRepository;
    const busyQuery = repository
      .createQueryBuilder('appointment')
      .select([
        'appointment.date',
        'appointment.startTime',
        'appointment.endTime',
      ])
      .where('appointment.professionalId = :professionalId', { professionalId })
      .andWhere('appointment.date BETWEEN :from AND :to', {
        from: effectiveFrom,
        to: effectiveTo,
      })
      .andWhere('appointment.status <> :cancelled', {
        cancelled: AppointmentStatus.CANCELADO,
      });
    if (options.excludeAppointmentId) {
      busyQuery.andWhere('appointment.id <> :excludeId', {
        excludeId: options.excludeAppointmentId,
      });
    }
    const busy = await busyQuery.getMany();

    return computeAvailableSlots({
      from: effectiveFrom,
      to: effectiveTo,
      schedules,
      exceptions,
      busy: busy.map((b) => ({
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      })),
      now,
    });
  }
}
