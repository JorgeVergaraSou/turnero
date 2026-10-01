import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentStatusHistoryEntity } from './entities/appointment-status-history.entity';
import {
  AppointmentSource,
  AppointmentStatus,
  PENDING_STATUSES,
  canTransition,
} from './appointment-status';
import {
  CreateAdminAppointmentDto,
  CreatePublicAppointmentDto,
  ListAppointmentsQueryDto,
  PublicAppointmentAccessDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';
import {
  AppointmentView,
  toAppointmentView,
  toPublicAppointmentView,
} from './dto/appointment-view';
import {
  AppointmentEvents,
  toAppointmentEventPayload,
} from './appointment.events';
import { generateAppointmentCode } from './appointment-code.util';
import { contactMismatch } from './contact-mismatch.util';
import { AvailabilityService } from './availability.service';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { PatientsService, memberNumberFor } from '@/patients/patients.service';
import { ProfessionalsService } from '@/professionals/professionals.service';
import { findSlot } from '@/scheduling/availability.calculator';
import { MAX_AVAILABILITY_RANGE_DAYS } from '@/scheduling/scheduling.enums';
import { AuditService } from '@/audit/audit.service';
import { SettingsService } from '@/settings/settings.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import {
  addDays,
  clinicNow,
  daysBetween,
  isPast,
  minutesUntil,
  normalizeTime,
} from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { appointmentsErrorLogger } from '@/config/module-loggers';

const SLOT_TAKEN_MESSAGE =
  'El horario elegido ya no está disponible. Por favor, elegí otro.';

interface BookingRequest {
  professionalId: number;
  specialtyId: number;
  date: string;
  startTime: string;
  source: AppointmentSource;
  actor: Actor;
  /** resuelve el paciente DENTRO de la transacción de la reserva */
  resolvePatient: (manager: EntityManager) => Promise<PatientEntity>;
  contactName: (patient: PatientEntity) => {
    firstName: string;
    lastName: string;
  };
  contactPhone: (patient: PatientEntity) => string;
  contactEmail: (patient: PatientEntity) => string | null;
  contactHealthInsuranceId: (patient: PatientEntity) => number | null;
  contactHealthInsuranceNumber: (patient: PatientEntity) => string | null;
  /** chequeos extra ya con el paciente resuelto, dentro de la transacción */
  beforeInsert?: (
    manager: EntityManager,
    patient: PatientEntity,
  ) => Promise<void>;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(AppointmentStatusHistoryEntity)
    private readonly historyRepository: Repository<AppointmentStatusHistoryEntity>,
    private readonly dataSource: DataSource,
    private readonly availabilityService: AvailabilityService,
    private readonly professionalsService: ProfessionalsService,
    private readonly patientsService: PatientsService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settingsService: SettingsService,
  ) {}

  // ------------------------------------------------------------------
  // Disponibilidad
  // ------------------------------------------------------------------

  async getPublicAvailability(
    professionalId: number,
    from: string,
    to: string,
  ) {
    try {
      await this.professionalsService.assertBookable(professionalId);
      const slots = await this.availabilityService.getAvailableSlots(
        professionalId,
        from,
        to,
      );
      return slots.map(({ date, startTime, endTime }) => ({
        date,
        startTime,
        endTime,
      }));
    } catch (error) {
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.getPublicAvailability',
        'Error al consultar la disponibilidad',
        { professionalId, from, to },
      );
    }
  }

  // ------------------------------------------------------------------
  // Reserva
  // ------------------------------------------------------------------

  /** Reserva pública, sin cuenta. */
  async createPublic(dto: CreatePublicAppointmentDto, actor: Actor) {
    const settings = await this.settingsService.get();
    if (!settings.publicBookingEnabled) {
      throw new ForbiddenException(
        `La reserva online está deshabilitada${settings.contactPhone ? `: pedí tu turno al ${settings.contactPhone}` : '. Comunicate con el consultorio'}`,
      );
    }
    let existingPatient = false;
    const appointment = await this.book({
      professionalId: dto.professionalId,
      specialtyId: dto.specialtyId,
      date: dto.date,
      startTime: dto.startTime,
      source: AppointmentSource.PUBLICO,
      actor,
      resolvePatient: async (manager) => {
        const { patient, created } =
          await this.patientsService.findOrCreateForBooking(
            dto.patient,
            manager,
          );
        existingPatient = !created;
        return patient;
      },
      beforeInsert: (manager, patient) =>
        this.assertPendingLimit(
          manager,
          patient.id,
          settings.publicMaxPendingPerPatient,
          settings.contactPhone,
        ),
      // el contacto que ingresó quien reservó, aunque el paciente ya
      // existiera con otro (ver PatientsService.findOrCreateForBooking)
      contactName: () => ({
        firstName: dto.patient.firstName,
        lastName: dto.patient.lastName,
      }),
      contactPhone: () => dto.patient.phone,
      contactEmail: () => dto.patient.email ?? null,
      contactHealthInsuranceId: () => dto.patient.healthInsuranceId,
      contactHealthInsuranceNumber: () => memberNumberFor(dto.patient),
    });
    if (existingPatient) {
      this.notifyPatientIfContactDiffers(appointment);
    }
    return toPublicAppointmentView(appointment);
  }

  /** Reserva desde recepción, para un paciente existente. */
  async createByReception(
    dto: CreateAdminAppointmentDto,
    actor: Actor,
  ): Promise<AppointmentView> {
    const appointment = await this.book({
      professionalId: dto.professionalId,
      specialtyId: dto.specialtyId,
      date: dto.date,
      startTime: dto.startTime,
      source: AppointmentSource.RECEPCION,
      actor,
      resolvePatient: async (manager) => {
        const patient = await manager
          .getRepository(PatientEntity)
          .findOneBy({ id: dto.patientId });
        if (!patient) {
          throw new NotFoundException('Paciente no encontrado');
        }
        return patient;
      },
      contactName: (patient) => ({
        firstName: patient.firstName,
        lastName: patient.lastName,
      }),
      contactPhone: (patient) => patient.phone,
      contactEmail: (patient) => patient.email,
      contactHealthInsuranceId: (patient) => patient.healthInsuranceId,
      contactHealthInsuranceNumber: (patient) => patient.healthInsuranceNumber,
    });
    return toAppointmentView(appointment);
  }

  /**
   * Reserva transaccional. Protección contra doble reserva en tres capas:
   * 1. SELECT … FOR UPDATE sobre el profesional: serializa las reservas
   *    de un mismo profesional (la segunda espera a la primera).
   * 2. Recalcula la disponibilidad DENTRO de la transacción, ya con el
   *    lock tomado: si el horario se ocupó, se rechaza.
   * 3. Índice único UQ_appointments_active_slot en la base: red de
   *    seguridad final si todo lo anterior fallara.
   */
  private async book(request: BookingRequest): Promise<AppointmentEntity> {
    const startTime = normalizeTime(request.startTime);
    await this.assertBookableDate(request.date, startTime);

    try {
      const appointmentId = await this.dataSource.transaction(
        async (manager) => {
          await this.professionalsService.lockForBooking(
            manager,
            request.professionalId,
          );
          await this.professionalsService.findBookableWithSpecialty(
            request.professionalId,
            request.specialtyId,
            manager,
          );

          const slots = await this.availabilityService.getAvailableSlots(
            request.professionalId,
            request.date,
            request.date,
            { manager },
          );
          const slot = findSlot(slots, request.date, startTime);
          if (!slot) {
            throw new ConflictException(SLOT_TAKEN_MESSAGE);
          }

          const patient = await request.resolvePatient(manager);
          await this.assertPatientFree(manager, patient.id, slot);
          await request.beforeInsert?.(manager, patient);

          const contactName = request.contactName(patient);
          const repository = manager.getRepository(AppointmentEntity);
          const inserted = await repository.insert({
            code: generateAppointmentCode(),
            patientId: patient.id,
            professionalId: request.professionalId,
            specialtyId: request.specialtyId,
            officeId: slot.officeId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: AppointmentStatus.RESERVADO,
            source: request.source,
            contactFirstName: contactName.firstName,
            contactLastName: contactName.lastName,
            contactPhone: request.contactPhone(patient),
            contactEmail: request.contactEmail(patient),
            contactHealthInsuranceId: request.contactHealthInsuranceId(patient),
            contactHealthInsuranceNumber:
              request.contactHealthInsuranceNumber(patient),
            createdByUserId: request.actor.userId,
          });
          const id = inserted.identifiers[0].id as number;

          await manager.getRepository(AppointmentStatusHistoryEntity).insert({
            appointmentId: id,
            fromStatus: null,
            toStatus: AppointmentStatus.RESERVADO,
            changedByUserId: request.actor.userId,
          });
          await this.auditService.record(
            {
              actor: request.actor,
              action: AuditAction.APPOINTMENT_CREATE,
              resourceType: 'appointment',
              resourceId: id,
              patientId: patient.id,
              metadata: { source: request.source },
            },
            manager,
          );
          return id;
        },
      );

      const appointment = await this.findEntity(appointmentId);
      this.emit(AppointmentEvents.CREATED, appointment);
      return appointment;
    } catch (error) {
      // la red de seguridad del índice único: otra reserva ganó el horario
      if (isDuplicateEntry(error)) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.book',
        'Error al reservar el turno',
        {
          professionalId: request.professionalId,
          date: request.date,
          startTime,
        },
      );
    }
  }

  // ------------------------------------------------------------------
  // Acceso público por código + DNI
  // ------------------------------------------------------------------

  async lookupPublic(dto: PublicAppointmentAccessDto, actor: Actor) {
    const appointment = await this.findByCodeAndDocument(dto, actor);
    return toPublicAppointmentView(appointment);
  }

  async cancelPublic(dto: PublicAppointmentAccessDto, actor: Actor) {
    const found = await this.findByCodeAndDocument(dto, actor);
    if (!PENDING_STATUSES.includes(found.status)) {
      throw new ConflictException('Este turno ya no se puede cancelar');
    }
    if (isPast(found.date, found.startTime)) {
      throw new ConflictException(
        'El horario del turno ya pasó; comunicate con el consultorio',
      );
    }
    const { publicCancelMinHours, contactPhone } =
      await this.settingsService.get();
    if (minutesUntil(found.date, found.startTime) < publicCancelMinHours * 60) {
      throw new ConflictException(
        `Online se puede cancelar hasta ${publicCancelMinHours} h antes del turno. Para cancelarlo ahora, ${contactPhone ? `llamá al ${contactPhone}` : 'comunicate con el consultorio'}.`,
      );
    }
    await this.applyStatusChange(
      found.id,
      AppointmentStatus.CANCELADO,
      actor,
      AuditAction.APPOINTMENT_CANCEL,
      'Cancelado por el paciente',
    );
    const appointment = await this.findEntity(found.id);
    this.emit(AppointmentEvents.CANCELLED, appointment);
    return toPublicAppointmentView(appointment);
  }

  /**
   * Mismo 404 genérico si el código no existe o si el DNI no coincide: la
   * respuesta no debe revelar que un código es válido. Los intentos
   * fallidos se auditan como DENIED (detección de fuerza bruta); el rate
   * limiting está en el controller.
   */
  private async findByCodeAndDocument(
    dto: PublicAppointmentAccessDto,
    actor: Actor,
  ): Promise<AppointmentEntity> {
    const appointment = await this.viewQuery()
      .where('appointment.code = :code', { code: dto.code })
      .getOne();
    const matches =
      !!appointment &&
      appointment.patient.documentNumber === dto.documentNumber;

    await this.auditService.record({
      actor,
      action: AuditAction.APPOINTMENT_PUBLIC_LOOKUP,
      resourceType: 'appointment',
      resourceId: matches ? appointment.id : null,
      patientId: matches ? appointment.patientId : null,
      result: matches ? AuditResult.SUCCESS : AuditResult.DENIED,
    });

    if (!matches) {
      throw new NotFoundException('No encontramos un turno con esos datos');
    }
    return appointment;
  }

  // ------------------------------------------------------------------
  // Gestión administrativa
  // ------------------------------------------------------------------

  async list(query: ListAppointmentsQueryDto): Promise<AppointmentView[]> {
    try {
      const qb = this.viewQuery()
        .orderBy('appointment.date', 'ASC')
        .addOrderBy('appointment.startTime', 'ASC');

      if (query.patientId) {
        qb.andWhere('appointment.patientId = :patientId', {
          patientId: query.patientId,
        });
      }
      if (query.from || !query.patientId) {
        const from = query.from ?? clinicNow().date;
        const to = query.to ?? from;
        if (from > to || daysBetween(from, to) >= MAX_AVAILABILITY_RANGE_DAYS) {
          throw new BadRequestException(
            `Rango de fechas inválido (máximo ${MAX_AVAILABILITY_RANGE_DAYS} días)`,
          );
        }
        qb.andWhere('appointment.date BETWEEN :from AND :to', { from, to });
      }
      if (query.professionalId) {
        qb.andWhere('appointment.professionalId = :professionalId', {
          professionalId: query.professionalId,
        });
      }
      if (query.status) {
        qb.andWhere('appointment.status = :status', { status: query.status });
      }

      const appointments = await qb.take(500).getMany();
      return appointments.map(toAppointmentView);
    } catch (error) {
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.list',
        'Error al buscar los turnos',
      );
    }
  }

  async findOneWithHistory(id: number) {
    try {
      const appointment = await this.findEntity(id);
      const history = await this.historyRepository.find({
        where: { appointmentId: id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      return {
        ...toAppointmentView(appointment),
        history: history.map((h) => ({
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          fromDate: h.fromDate,
          fromStartTime: h.fromStartTime,
          toDate: h.toDate,
          toStartTime: h.toStartTime,
          changedByUserId: h.changedByUserId,
          reason: h.reason,
          createdAt: h.createdAt,
        })),
      };
    } catch (error) {
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.findOneWithHistory',
        'Error al buscar el turno',
        { id },
      );
    }
  }

  async confirm(id: number, actor: Actor): Promise<AppointmentView> {
    await this.applyStatusChange(
      id,
      AppointmentStatus.CONFIRMADO,
      actor,
      AuditAction.APPOINTMENT_CONFIRM,
      null,
      (appointment) => {
        if (appointment.date < clinicNow().date) {
          throw new ConflictException('No se puede confirmar un turno pasado');
        }
      },
    );
    return toAppointmentView(await this.findEntity(id));
  }

  async cancel(
    id: number,
    reason: string,
    actor: Actor,
  ): Promise<AppointmentView> {
    await this.applyStatusChange(
      id,
      AppointmentStatus.CANCELADO,
      actor,
      AuditAction.APPOINTMENT_CANCEL,
      reason,
    );
    const appointment = await this.findEntity(id);
    this.emit(AppointmentEvents.CANCELLED, appointment);
    return toAppointmentView(appointment);
  }

  async markNoShow(id: number, actor: Actor): Promise<AppointmentView> {
    await this.applyStatusChange(
      id,
      AppointmentStatus.AUSENTE,
      actor,
      AuditAction.APPOINTMENT_NO_SHOW,
      null,
      (appointment) => {
        if (!isPast(appointment.date, appointment.startTime)) {
          throw new ConflictException(
            'Solo se puede marcar ausente un turno cuyo horario ya empezó',
          );
        }
      },
    );
    return toAppointmentView(await this.findEntity(id));
  }

  /**
   * Reprogramar: mismo turno (mismo código), nueva fecha/hora, vuelve a
   * RESERVADO. Mismo esquema de lock que una reserva nueva; el horario
   * actual del turno no cuenta como ocupado para sí mismo.
   */
  async reschedule(
    id: number,
    dto: RescheduleAppointmentDto,
    actor: Actor,
  ): Promise<AppointmentView> {
    const startTime = normalizeTime(dto.startTime);
    await this.assertBookableDate(dto.date, startTime);

    try {
      await this.dataSource.transaction(async (manager) => {
        // mismo orden de locks que una reserva nueva (profesional → turno),
        // para que una reserva y una reprogramación concurrentes no se
        // bloqueen mutuamente (deadlock)
        const unlocked = await manager
          .getRepository(AppointmentEntity)
          .findOneBy({ id });
        if (!unlocked) {
          throw new NotFoundException('Turno no encontrado');
        }
        await this.professionalsService.lockForBooking(
          manager,
          unlocked.professionalId,
        );
        const current = await this.lockAppointment(manager, id);
        if (!PENDING_STATUSES.includes(current.status)) {
          throw new ConflictException(
            'Solo se pueden reprogramar turnos reservados o confirmados',
          );
        }
        await this.professionalsService.findBookableWithSpecialty(
          current.professionalId,
          current.specialtyId,
          manager,
        );

        const slots = await this.availabilityService.getAvailableSlots(
          current.professionalId,
          dto.date,
          dto.date,
          { manager, excludeAppointmentId: id },
        );
        const slot = findSlot(slots, dto.date, startTime);
        if (!slot) {
          throw new ConflictException(SLOT_TAKEN_MESSAGE);
        }
        await this.assertPatientFree(manager, current.patientId, slot, id);

        await manager.getRepository(AppointmentEntity).update(id, {
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          officeId: slot.officeId,
          status: AppointmentStatus.RESERVADO,
          // nueva fecha/hora: corresponde un recordatorio nuevo
          reminderSentAt: null,
        });
        await manager.getRepository(AppointmentStatusHistoryEntity).insert({
          appointmentId: id,
          fromStatus: current.status,
          toStatus: AppointmentStatus.RESERVADO,
          fromDate: current.date,
          fromStartTime: current.startTime,
          toDate: slot.date,
          toStartTime: slot.startTime,
          changedByUserId: actor.userId,
          reason: dto.reason ?? null,
        });
        await this.auditService.record(
          {
            actor,
            action: AuditAction.APPOINTMENT_RESCHEDULE,
            resourceType: 'appointment',
            resourceId: id,
            patientId: current.patientId,
            reason: dto.reason ?? null,
          },
          manager,
        );
      });

      const appointment = await this.findEntity(id);
      this.emit(AppointmentEvents.RESCHEDULED, appointment);
      return toAppointmentView(appointment);
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw new ConflictException(SLOT_TAKEN_MESSAGE);
      }
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.reschedule',
        'Error al reprogramar el turno',
        { id },
      );
    }
  }

  // ------------------------------------------------------------------
  // Usado por el panel médico / módulo clínico
  // ------------------------------------------------------------------

  /** Turnos de un profesional en un rango (agenda propia del médico). */
  async listForProfessional(
    professionalId: number,
    from: string,
    to: string,
  ): Promise<AppointmentView[]> {
    return this.list({ professionalId, from, to });
  }

  /**
   * Cambia el estado dentro de una transacción ya abierta (lo usa el
   * módulo clínico al iniciar/finalizar una atención, para que el turno y
   * la consulta cambien juntos). Valida la transición y deja historial.
   */
  async transitionInTransaction(
    manager: EntityManager,
    appointment: AppointmentEntity,
    to: AppointmentStatus,
    actor: Actor,
    reason: string | null = null,
  ): Promise<void> {
    if (!canTransition(appointment.status, to)) {
      throw new ConflictException(
        `No se puede pasar un turno de ${appointment.status} a ${to}`,
      );
    }
    await manager.getRepository(AppointmentEntity).update(appointment.id, {
      status: to,
      ...(to === AppointmentStatus.CANCELADO && { cancellationReason: reason }),
    });
    await manager.getRepository(AppointmentStatusHistoryEntity).insert({
      appointmentId: appointment.id,
      fromStatus: appointment.status,
      toStatus: to,
      changedByUserId: actor.userId,
      reason,
    });
    appointment.status = to;
  }

  /** SELECT … FOR UPDATE del turno: dos cambios de estado simultáneos
   * sobre el mismo turno (dos recepcionistas) se serializan. */
  async lockAppointment(
    manager: EntityManager,
    id: number,
  ): Promise<AppointmentEntity> {
    const appointment = await manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .setLock('pessimistic_write')
      .where('appointment.id = :id', { id })
      .getOne();
    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }
    return appointment;
  }

  async findEntity(id: number): Promise<AppointmentEntity> {
    const appointment = await this.viewQuery()
      .where('appointment.id = :id', { id })
      .getOne();
    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }
    return appointment;
  }

  // ------------------------------------------------------------------

  private async applyStatusChange(
    id: number,
    to: AppointmentStatus,
    actor: Actor,
    action: AuditAction,
    reason: string | null,
    extraCheck?: (appointment: AppointmentEntity) => void,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const appointment = await this.lockAppointment(manager, id);
        extraCheck?.(appointment);
        await this.transitionInTransaction(
          manager,
          appointment,
          to,
          actor,
          reason,
        );
        await this.auditService.record(
          {
            actor,
            action,
            resourceType: 'appointment',
            resourceId: id,
            patientId: appointment.patientId,
            reason,
          },
          manager,
        );
      });
    } catch (error) {
      handleServiceError(
        error,
        appointmentsErrorLogger,
        'AppointmentsService.applyStatusChange',
        'Error al actualizar el turno',
        { id, to },
      );
    }
  }

  private async assertBookableDate(date: string, startTime: string) {
    if (isPast(date, startTime)) {
      throw new BadRequestException(
        'No se puede reservar en un horario pasado',
      );
    }
    const { bookingHorizonDays } = await this.settingsService.get();
    if (date > addDays(clinicNow().date, bookingHorizonDays)) {
      throw new BadRequestException(
        `Solo se pueden reservar turnos hasta ${bookingHorizonDays} días hacia adelante`,
      );
    }
  }

  /**
   * Tope de turnos pendientes por DNI en la reserva web. Sin verificación
   * de identidad, acota cuántos horarios puede ocupar alguien que use un
   * DNI ajeno. Bloquea la fila del paciente: dos reservas simultáneas del
   * mismo DNI (con profesionales distintos, que no comparten el lock del
   * profesional) se cuentan de a una.
   */
  private async assertPendingLimit(
    manager: EntityManager,
    patientId: number,
    max: number,
    contactPhone: string | null,
  ) {
    if (max === 0) return;
    await manager
      .getRepository(PatientEntity)
      .createQueryBuilder('patient')
      .setLock('pessimistic_write')
      .where('patient.id = :patientId', { patientId })
      .getOne();
    const pending = await manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .where('appointment.patientId = :patientId', { patientId })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: PENDING_STATUSES,
      })
      .andWhere('appointment.date >= :today', { today: clinicNow().date })
      .getCount();
    if (pending >= max) {
      throw new ConflictException(
        `Ya hay ${pending} ${pending === 1 ? 'turno pendiente' : 'turnos pendientes'} con ese DNI. Para sacar otro, cancelá alguno desde "Mi turno" o ${contactPhone ? `llamá al ${contactPhone}` : 'comunicate con el consultorio'}.`,
      );
    }
  }

  /**
   * Reserva web con un DNI que ya tenía legajo y datos de contacto que no
   * coinciden: puede ser alguien usando un DNI ajeno. Se avisa al email
   * DEL LEGAJO (el titular), con el código: con código + su DNI puede
   * cancelarlo él mismo desde "Mi turno". Si quien reservó es el titular
   * con un email nuevo, el aviso le llega igual a su email viejo.
   */
  private notifyPatientIfContactDiffers(appointment: AppointmentEntity) {
    const { patient } = appointment;
    const differs =
      contactMismatch({
        contact: {
          firstName: appointment.contactFirstName,
          lastName: appointment.contactLastName,
          phone: appointment.contactPhone,
          email: appointment.contactEmail,
          healthInsuranceId: appointment.contactHealthInsuranceId,
          healthInsuranceNumber: appointment.contactHealthInsuranceNumber,
        },
        patient,
      }).length > 0;
    if (
      !differs ||
      !patient.email ||
      patient.email.toLowerCase() === appointment.contactEmail?.toLowerCase()
    ) {
      return;
    }
    this.eventEmitter
      .emitAsync(AppointmentEvents.IDENTITY_NOTICE, {
        ...toAppointmentEventPayload(appointment),
        contactEmail: patient.email,
        patientFirstName: patient.firstName,
      })
      .catch((error) =>
        appointmentsErrorLogger.error(
          `[AppointmentsService.notifyPatientIfContactDiffers] falló: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }

  /** Un paciente no puede tener dos turnos vigentes que se pisen
   * (aunque sean con profesionales distintos). */
  private async assertPatientFree(
    manager: EntityManager,
    patientId: number,
    slot: { date: string; startTime: string; endTime: string },
    excludeAppointmentId?: number,
  ) {
    const query = manager
      .getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .where('appointment.patientId = :patientId', { patientId })
      .andWhere('appointment.date = :date', { date: slot.date })
      .andWhere('appointment.startTime < :endTime', { endTime: slot.endTime })
      .andWhere('appointment.endTime > :startTime', {
        startTime: slot.startTime,
      })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.RESERVADO,
          AppointmentStatus.CONFIRMADO,
          AppointmentStatus.EN_ATENCION,
        ],
      });
    if (excludeAppointmentId) {
      query.andWhere('appointment.id <> :excludeId', {
        excludeId: excludeAppointmentId,
      });
    }
    if (await query.getExists()) {
      throw new ConflictException(
        'El paciente ya tiene otro turno en ese horario',
      );
    }
  }

  private viewQuery() {
    return this.appointmentRepository
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.patient', 'patient')
      .leftJoinAndSelect('patient.healthInsurance', 'patientHealthInsurance')
      .leftJoinAndSelect(
        'appointment.contactHealthInsurance',
        'contactHealthInsurance',
      )
      .innerJoinAndSelect('appointment.professional', 'professional')
      .withDeleted() // el médico pudo haber sido dado de baja después del turno
      .innerJoinAndSelect('professional.user', 'professionalUser')
      .innerJoinAndSelect('appointment.specialty', 'specialty')
      .innerJoinAndSelect('appointment.office', 'office');
  }

  private emit(event: string, appointment: AppointmentEntity) {
    const payload = toAppointmentEventPayload(appointment);
    // emitAsync sin await: un fallo de notificación no debe afectar la
    // respuesta de una reserva que ya quedó confirmada en la base
    this.eventEmitter
      .emitAsync(event, payload)
      .catch((error) =>
        appointmentsErrorLogger.error(
          `[AppointmentsService.emit] ${event} falló: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    ((error as any).driverError?.code === 'ER_DUP_ENTRY' ||
      (error as any).driverError?.errno === 1062)
  );
}
