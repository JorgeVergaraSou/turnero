import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MedicalConsultationEntity } from './entities/medical-consultation.entity';
import { ConsultationDiagnosisEntity } from './entities/consultation-diagnosis.entity';
import { ConsultationMedicationEntity } from './entities/consultation-medication.entity';
import { ConsultationStudyRequestEntity } from './entities/consultation-study-request.entity';
import { ConsultationAmendmentEntity } from './entities/consultation-amendment.entity';
import { ConsultationStatus } from './clinical.enums';
import {
  CreateAmendmentDto,
  UpdateConsultationDto,
} from './dto/consultation.dto';
import {
  ConsultationView,
  computeContentHash,
  toConsultationView,
} from './consultation-view';
import {
  ClinicalAccessService,
  PATIENT_ACCESS_DENIED,
} from './clinical-access.service';
import { AppointmentsService } from '@/appointments/appointments.service';
import { AppointmentStatus } from '@/appointments/appointment-status';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { clinicNow } from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { clinicalErrorLogger } from '@/config/module-loggers';

const SCALAR_FIELDS = [
  'reason',
  'anamnesis',
  'physicalExam',
  'evolution',
  'indications',
  'observations',
  'weightKg',
  'heightCm',
  'systolicBp',
  'diastolicBp',
  'heartRate',
  'temperatureC',
  'oxygenSaturation',
] as const;

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectRepository(MedicalConsultationEntity)
    private readonly consultationRepository: Repository<MedicalConsultationEntity>,
    private readonly dataSource: DataSource,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly appointmentsService: AppointmentsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Iniciar atención: el turno pasa a EN_ATENCION y se abre una consulta
   * BORRADOR, todo en una transacción. Idempotente: si el turno ya está
   * EN_ATENCION con su consulta, devuelve esa (ej. el médico recargó).
   */
  async startAttention(
    appointmentId: number,
    actor: Actor,
  ): Promise<ConsultationView> {
    try {
      const professional = await this.clinicalAccess.requireProfessional(actor);

      const consultationId = await this.dataSource.transaction(
        async (manager) => {
          const appointment = await this.appointmentsService.lockAppointment(
            manager,
            appointmentId,
          );
          if (appointment.professionalId !== professional.id) {
            // SIN manager a propósito: el throw de abajo revierte la transacción,
            // y el intento denegado tiene que quedar auditado igual
            await this.auditService.record({
              actor,
              action: AuditAction.START_ATTENTION,
              resourceType: 'appointment',
              resourceId: appointmentId,
              patientId: appointment.patientId,
              result: AuditResult.DENIED,
            });
            // 404 (no 403): no confirmar que existe un turno de otro médico
            throw new NotFoundException('Turno no encontrado');
          }

          const existing = await manager
            .getRepository(MedicalConsultationEntity)
            .findOneBy({ appointmentId });
          if (
            appointment.status === AppointmentStatus.EN_ATENCION &&
            existing
          ) {
            return existing.id;
          }
          if (appointment.date !== clinicNow().date) {
            throw new ConflictException(
              'Solo se puede iniciar la atención de un turno de hoy',
            );
          }

          await this.appointmentsService.transitionInTransaction(
            manager,
            appointment,
            AppointmentStatus.EN_ATENCION,
            actor,
          );
          const inserted = await manager
            .getRepository(MedicalConsultationEntity)
            .insert({
              appointmentId,
              patientId: appointment.patientId,
              professionalId: professional.id,
              status: ConsultationStatus.BORRADOR,
              startedAt: new Date(),
              createdByUserId: actor.userId!,
            });
          const id = inserted.identifiers[0].id as number;

          for (const action of [
            AuditAction.START_ATTENTION,
            AuditAction.CREATE_MEDICAL_CONSULTATION,
          ]) {
            await this.auditService.record(
              {
                actor,
                action,
                resourceType: 'medical_consultation',
                resourceId: id,
                patientId: appointment.patientId,
                metadata: { appointmentId },
              },
              manager,
            );
          }
          return id;
        },
      );

      return toConsultationView(await this.loadFull(consultationId));
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.startAttention',
        'Error al iniciar la atención',
        { appointmentId },
      );
    }
  }

  /** Consulta del turno (para retomar una atención en curso). */
  async findByAppointment(
    appointmentId: number,
    actor: Actor,
  ): Promise<ConsultationView> {
    const consultation = await this.consultationRepository.findOneBy({
      appointmentId,
    });
    if (!consultation) {
      throw new NotFoundException('El turno no tiene una consulta iniciada');
    }
    return this.findOne(consultation.id, actor);
  }

  async findOne(id: number, actor: Actor): Promise<ConsultationView> {
    try {
      const consultation = await this.loadFull(id);
      await this.clinicalAccess.assertPatientAccess(
        actor,
        consultation.patientId,
        AuditAction.VIEW_MEDICAL_CONSULTATION,
        { type: 'medical_consultation', id },
      );
      // un borrador es privado de su autor hasta que se finaliza
      if (
        consultation.status === ConsultationStatus.BORRADOR &&
        consultation.createdByUserId !== actor.userId
      ) {
        throw new NotFoundException('Consulta no encontrada');
      }
      await this.auditService.record({
        actor,
        action: AuditAction.VIEW_MEDICAL_CONSULTATION,
        resourceType: 'medical_consultation',
        resourceId: id,
        patientId: consultation.patientId,
      });
      return toConsultationView(consultation);
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.findOne',
        'Error al buscar la consulta',
        { id },
      );
    }
  }

  /** Guardar borrador: solo el autor, solo mientras está en BORRADOR. */
  async updateDraft(
    id: number,
    dto: UpdateConsultationDto,
    actor: Actor,
  ): Promise<ConsultationView> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const consultation = await this.lockEditableDraft(manager, id, actor);

        const scalarChanges: Partial<
          Record<(typeof SCALAR_FIELDS)[number], unknown>
        > = {};
        for (const field of SCALAR_FIELDS) {
          if (dto[field] !== undefined) {
            scalarChanges[field] = dto[field];
          }
        }
        if (Object.keys(scalarChanges).length > 0) {
          await manager
            .getRepository(MedicalConsultationEntity)
            .update(id, scalarChanges as Partial<MedicalConsultationEntity>);
        }

        if (dto.diagnoses) {
          const repo = manager.getRepository(ConsultationDiagnosisEntity);
          await repo.delete({ consultationId: id });
          if (dto.diagnoses.length) {
            await repo.insert(
              dto.diagnoses.map((d) => ({
                consultationId: id,
                type: d.type,
                description: d.description,
                codeSystem: d.codeSystem ?? null,
                code: d.code ?? null,
              })),
            );
          }
        }
        if (dto.medications) {
          const repo = manager.getRepository(ConsultationMedicationEntity);
          await repo.delete({ consultationId: id });
          if (dto.medications.length) {
            await repo.insert(
              dto.medications.map((m) => ({
                consultationId: id,
                drugName: m.drugName,
                dose: m.dose ?? null,
                frequency: m.frequency ?? null,
                duration: m.duration ?? null,
                notes: m.notes ?? null,
              })),
            );
          }
        }
        if (dto.studyRequests) {
          const repo = manager.getRepository(ConsultationStudyRequestEntity);
          await repo.delete({ consultationId: id });
          if (dto.studyRequests.length) {
            await repo.insert(
              dto.studyRequests.map((s) => ({
                consultationId: id,
                type: s.type,
                description: s.description,
                notes: s.notes ?? null,
              })),
            );
          }
        }

        await this.auditService.record(
          {
            actor,
            action: AuditAction.UPDATE_MEDICAL_CONSULTATION,
            resourceType: 'medical_consultation',
            resourceId: id,
            patientId: consultation.patientId,
            // QUÉ secciones cambiaron, nunca su contenido
            metadata: { fields: Object.keys(dto) },
          },
          manager,
        );
      });
      return toConsultationView(await this.loadFull(id));
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.updateDraft',
        'Error al guardar la consulta',
        { id },
      );
    }
  }

  /**
   * Finalizar: la consulta pasa a FINALIZADA (inmutable desde acá, también
   * a nivel base de datos), se calcula su hash de contenido y el turno pasa
   * a ATENDIDO — todo junto o nada.
   */
  async finalize(id: number, actor: Actor): Promise<ConsultationView> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const locked = await this.lockEditableDraft(manager, id, actor);
        const consultation = await this.loadFull(id, manager);
        if (!consultation.reason?.trim()) {
          throw new BadRequestException(
            'Para finalizar, complete al menos el motivo de consulta',
          );
        }

        // sin milisegundos: DATETIME de MySQL no los guarda, y el hash
        // tiene que poder recalcularse con el valor leído de la base
        const finalizedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        const contentHash = computeContentHash(
          consultation,
          finalizedAt,
          actor.userId!,
        );

        await manager.getRepository(MedicalConsultationEntity).update(id, {
          status: ConsultationStatus.FINALIZADA,
          finalizedAt,
          finalizedByUserId: actor.userId!,
          contentHash,
        });

        const appointment = await this.appointmentsService.lockAppointment(
          manager,
          locked.appointmentId,
        );
        await this.appointmentsService.transitionInTransaction(
          manager,
          appointment,
          AppointmentStatus.ATENDIDO,
          actor,
        );

        await this.auditService.record(
          {
            actor,
            action: AuditAction.FINALIZE_MEDICAL_CONSULTATION,
            resourceType: 'medical_consultation',
            resourceId: id,
            patientId: consultation.patientId,
            metadata: { contentHash },
          },
          manager,
        );
      });
      return toConsultationView(await this.loadFull(id));
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.finalize',
        'Error al finalizar la consulta',
        { id },
      );
    }
  }

  /** Enmienda a una consulta FINALIZADA: la única forma de corregirla. */
  async addAmendment(
    id: number,
    dto: CreateAmendmentDto,
    actor: Actor,
  ): Promise<ConsultationView> {
    try {
      const consultation = await this.consultationRepository.findOneBy({ id });
      if (!consultation) {
        throw new NotFoundException('Consulta no encontrada');
      }
      await this.clinicalAccess.assertPatientAccess(
        actor,
        consultation.patientId,
        AuditAction.AMEND_MEDICAL_CONSULTATION,
        { type: 'medical_consultation', id },
      );
      if (consultation.createdByUserId !== actor.userId) {
        throw new ForbiddenException(
          'Solo el autor de la consulta puede enmendarla',
        );
      }
      if (consultation.status !== ConsultationStatus.FINALIZADA) {
        throw new ConflictException(
          'La consulta está en borrador: editala directamente en vez de enmendarla',
        );
      }

      await this.dataSource.transaction(async (manager) => {
        const inserted = await manager
          .getRepository(ConsultationAmendmentEntity)
          .insert({
            consultationId: id,
            authorUserId: actor.userId!,
            content: dto.content,
            reason: dto.reason,
          });
        await this.auditService.record(
          {
            actor,
            action: AuditAction.AMEND_MEDICAL_CONSULTATION,
            resourceType: 'medical_consultation',
            resourceId: id,
            patientId: consultation.patientId,
            reason: dto.reason,
            metadata: { amendmentId: inserted.identifiers[0].id },
          },
          manager,
        );
      });
      return toConsultationView(await this.loadFull(id));
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.addAmendment',
        'Error al registrar la enmienda',
        { id },
      );
    }
  }

  /**
   * Historia clínica longitudinal: todas las consultas FINALIZADAS del
   * paciente (de todos los profesionales), más reciente primero, paginada.
   * Los borradores no forman parte de la historia hasta finalizarse.
   */
  async getClinicalHistory(
    patientId: number,
    actor: Actor,
    page: number,
    limit: number,
  ) {
    try {
      await this.clinicalAccess.assertPatientAccess(
        actor,
        patientId,
        AuditAction.VIEW_CLINICAL_HISTORY,
      );

      const [ids, total] = await this.consultationRepository.findAndCount({
        select: { id: true },
        where: { patientId, status: ConsultationStatus.FINALIZADA },
        order: { startedAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      const items = await Promise.all(ids.map(({ id }) => this.loadFull(id)));

      await this.auditService.record({
        actor,
        action: AuditAction.VIEW_CLINICAL_HISTORY,
        resourceType: 'patient',
        resourceId: patientId,
        patientId,
        metadata: { page, limit },
      });
      return { items: items.map(toConsultationView), total, page, limit };
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.getClinicalHistory',
        'Error al obtener la historia clínica',
        { patientId },
      );
    }
  }

  /** Datos administrativos de un paciente, para el médico con relación. */
  async getPatient(patientId: number, actor: Actor) {
    try {
      await this.clinicalAccess.assertPatientAccess(
        actor,
        patientId,
        AuditAction.VIEW_PATIENT,
      );
      const patient = await this.dataSource
        .getRepository(PatientEntity)
        .findOneBy({ id: patientId });
      if (!patient) {
        throw new ForbiddenException(PATIENT_ACCESS_DENIED);
      }
      await this.auditService.record({
        actor,
        action: AuditAction.VIEW_PATIENT,
        resourceType: 'patient',
        resourceId: patientId,
        patientId,
      });
      return {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        documentNumber: patient.documentNumber,
        birthDate: patient.birthDate,
        phone: patient.phone,
        email: patient.email,
      };
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.getPatient',
        'Error al obtener el paciente',
        { patientId },
      );
    }
  }

  /** Pacientes con los que el médico tiene o tuvo turnos (búsqueda). */
  async listMyPatients(actor: Actor, q?: string) {
    try {
      const professional = await this.clinicalAccess.requireProfessional(actor);
      const query = this.dataSource
        .getRepository(PatientEntity)
        .createQueryBuilder('patient')
        .where(
          `patient.id IN (SELECT a.patient_id FROM appointments a
            WHERE a.professional_id = :professionalId AND a.status <> 'CANCELADO')`,
          { professionalId: professional.id },
        )
        .orderBy('patient.lastName', 'ASC')
        .addOrderBy('patient.firstName', 'ASC')
        .take(100);
      const term = q?.trim();
      if (term) {
        query.andWhere(
          "(patient.documentNumber LIKE :document OR CONCAT(patient.lastName, ' ', patient.firstName) LIKE :name)",
          {
            document: `${term
              .replace(/[.\s-]/g, '')
              .toUpperCase()
              .replace(/[\\%_]/g, '\\$&')}%`,
            name: `%${term.replace(/[\\%_]/g, '\\$&')}%`,
          },
        );
      }
      const patients = await query.getMany();
      return patients.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        documentNumber: p.documentNumber,
        birthDate: p.birthDate,
      }));
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'ConsultationsService.listMyPatients',
        'Error al buscar pacientes',
      );
    }
  }

  // ------------------------------------------------------------------

  /** Lock de la consulta + reglas de edición: existe, es del médico
   * logueado (autor) y sigue en BORRADOR. */
  private async lockEditableDraft(
    manager: EntityManager,
    id: number,
    actor: Actor,
  ): Promise<MedicalConsultationEntity> {
    const consultation = await manager
      .getRepository(MedicalConsultationEntity)
      .createQueryBuilder('consultation')
      .setLock('pessimistic_write')
      .where('consultation.id = :id', { id })
      .getOne();
    if (!consultation || consultation.createdByUserId !== actor.userId) {
      if (consultation) {
        // SIN manager a propósito: el throw de abajo revierte la transacción,
        // y el intento denegado tiene que quedar auditado igual
        await this.auditService.record({
          actor,
          action: AuditAction.UPDATE_MEDICAL_CONSULTATION,
          resourceType: 'medical_consultation',
          resourceId: id,
          patientId: consultation.patientId,
          result: AuditResult.DENIED,
        });
      }
      throw new NotFoundException('Consulta no encontrada');
    }
    if (consultation.status !== ConsultationStatus.BORRADOR) {
      throw new ConflictException(
        'La consulta está finalizada y no puede modificarse. Para corregirla, agregá una enmienda.',
      );
    }
    return consultation;
  }

  private async loadFull(
    id: number,
    manager?: EntityManager,
  ): Promise<MedicalConsultationEntity> {
    const repository = manager
      ? manager.getRepository(MedicalConsultationEntity)
      : this.consultationRepository;
    const consultation = await repository
      .createQueryBuilder('consultation')
      .withDeleted()
      .innerJoinAndSelect('consultation.professional', 'professional')
      .innerJoinAndSelect('professional.user', 'professionalUser')
      .leftJoinAndSelect('professional.specialties', 'specialty')
      .leftJoinAndSelect('consultation.diagnoses', 'diagnosis')
      .leftJoinAndSelect('consultation.medications', 'medication')
      .leftJoinAndSelect('consultation.studyRequests', 'studyRequest')
      .leftJoinAndSelect('consultation.amendments', 'amendment')
      .where('consultation.id = :id', { id })
      .getOne();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }
    return consultation;
  }
}
