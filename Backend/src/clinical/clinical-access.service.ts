import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import { AppointmentStatus } from '@/appointments/appointment-status';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';
import { ProfessionalsService } from '@/professionals/professionals.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';

export const PATIENT_ACCESS_DENIED =
  'No tenés autorización para acceder a este paciente';

/**
 * Única puerta de acceso a información clínica de un paciente. El guard
 * (@RequirePermissions(CLINICAL_READ)) ya verificó autenticación, rol y
 * permiso; esto verifica la RELACIÓN con el recurso (prevención de
 * IDOR/BOLA): que el médico logueado tenga o haya tenido un turno no
 * cancelado con ese paciente. Con relación, ve la historia longitudinal
 * COMPLETA (de todos los profesionales) — decisión de diseño aprobada;
 * cada acceso queda auditado.
 *
 * Paciente inexistente y paciente sin relación responden igual (403), así
 * no se puede enumerar qué IDs de paciente existen.
 */
@Injectable()
export class ClinicalAccessService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    private readonly professionalsService: ProfessionalsService,
    private readonly auditService: AuditService,
  ) {}

  /** Perfil profesional del usuario logueado; sin perfil no hay acceso clínico. */
  async requireProfessional(actor: Actor): Promise<ProfessionalEntity> {
    const professional = actor.userId
      ? await this.professionalsService.findByUserId(actor.userId)
      : null;
    if (!professional) {
      throw new ForbiddenException(
        'Tu usuario no tiene un perfil profesional asociado',
      );
    }
    return professional;
  }

  async hasRelation(
    professionalId: number,
    patientId: number,
  ): Promise<boolean> {
    return this.appointmentRepository
      .createQueryBuilder('appointment')
      .where('appointment.professionalId = :professionalId', { professionalId })
      .andWhere('appointment.patientId = :patientId', { patientId })
      .andWhere('appointment.status <> :cancelled', {
        cancelled: AppointmentStatus.CANCELADO,
      })
      .getExists();
  }

  /**
   * Exige relación médico↔paciente. Si no la hay, audita el intento como
   * DENIED (quién, qué paciente, qué acción) y lanza 403.
   */
  async assertPatientAccess(
    actor: Actor,
    patientId: number,
    action: AuditAction,
    resource: { type: string; id?: number | null } = { type: 'patient' },
  ): Promise<ProfessionalEntity> {
    const professional = await this.requireProfessional(actor);
    if (!(await this.hasRelation(professional.id, patientId))) {
      await this.auditService.record({
        actor,
        action,
        resourceType: resource.type,
        resourceId: resource.id ?? patientId,
        patientId,
        result: AuditResult.DENIED,
      });
      throw new ForbiddenException(PATIENT_ACCESS_DENIED);
    }
    return professional;
  }
}
