import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AppointmentCallEntity } from './entities/appointment-call.entity';
import { ClinicalAccessService } from './clinical-access.service';
import {
  MAX_CALLS_PER_APPOINTMENT,
  MIN_SECONDS_BETWEEN_CALLS,
  decideCall,
} from './appointment-call.policy';
import { SettingsService } from '@/settings/settings.service';
import { AppointmentsService } from '@/appointments/appointments.service';
import { AppointmentEntity } from '@/appointments/entities/appointment.entity';
import {
  AppointmentCalledPayload,
  AppointmentEvents,
} from '@/appointments/appointment.events';
import { OfficeEntity } from '@/offices/entities/office.entity';
import { PatientEntity } from '@/patients/entities/patient.entity';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResult } from '@/audit/audit.enums';
import { Actor } from '@/common/interfaces/actor.interface';
import { clinicNow } from '@/common/utils/clinic-time.util';
import { handleServiceError } from '@/common/utils/error-handler.util';
import { clinicalErrorLogger } from '@/config/module-loggers';

export interface CallResult {
  callNumber: number;
  calledAt: string;
  officeName: string;
  /** llamados que todavía se pueden hacer a este turno */
  remainingCalls: number;
  /** segundos hasta poder volver a llamar */
  nextCallInSeconds: number;
}

/**
 * Llamado de pacientes. Reglas (ver appointment-call.policy.ts): solo el
 * médico DUEÑO del turno, solo un turno de hoy en sala de espera
 * (CONFIRMADO), con tope de repeticiones y pausa entre llamados.
 *
 * El turno no cambia de estado: pasa a EN_ATENCION recién al iniciar la
 * atención. Mismo patrón de seguridad que ConsultationsService.startAttention:
 * turno de otro médico → 404 (no confirma que existe) y el intento queda
 * auditado como DENIED fuera de la transacción.
 */
@Injectable()
export class AppointmentCallsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly appointmentsService: AppointmentsService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  async call(appointmentId: number, actor: Actor): Promise<CallResult> {
    try {
      const professional = await this.clinicalAccess.requireProfessional(actor);

      // el admin puede desactivar el sistema de llamados desde Configuración
      if (!(await this.settings.get()).callsEnabled) {
        throw new ConflictException('El llamado de pacientes está desactivado');
      }

      const { result, payload } = await this.dataSource.transaction(
        async (manager) => {
          // el bloqueo serializa dos llamados simultáneos al mismo turno
          const appointment = await this.appointmentsService.lockAppointment(
            manager,
            appointmentId,
          );
          if (appointment.professionalId !== professional.id) {
            // SIN manager: el throw revierte la transacción y el intento
            // denegado tiene que quedar auditado igual
            await this.auditService.record({
              actor,
              action: AuditAction.CALL_PATIENT,
              resourceType: 'appointment',
              resourceId: appointmentId,
              patientId: appointment.patientId,
              result: AuditResult.DENIED,
            });
            throw new NotFoundException('Turno no encontrado');
          }

          const callRepository = manager.getRepository(AppointmentCallEntity);
          const last = await callRepository.findOne({
            where: { appointmentId },
            order: { callNumber: 'DESC' },
          });
          const now = new Date();
          const decision = decideCall({
            status: appointment.status,
            isToday: appointment.date === clinicNow().date,
            previousCalls: last?.callNumber ?? 0,
            lastCalledAt: last?.calledAt ?? null,
            now,
          });

          if (!decision.allowed) {
            if (decision.reason === 'NOT_WAITING') {
              throw new ConflictException(
                'El paciente no está en sala de espera',
              );
            }
            if (decision.reason === 'MAX_CALLS') {
              throw new HttpException(
                `Se alcanzó el máximo de ${MAX_CALLS_PER_APPOINTMENT} llamados para este turno`,
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }
            throw new HttpException(
              `Esperá ${decision.retryAfterSeconds} segundos antes de volver a llamar`,
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          const [patient, office] = await Promise.all([
            manager.getRepository(PatientEntity).findOneByOrFail({
              id: appointment.patientId,
            }),
            manager.getRepository(OfficeEntity).findOneByOrFail({
              id: appointment.officeId,
            }),
          ]);

          await callRepository.insert({
            appointmentId,
            officeId: appointment.officeId,
            calledByUserId: actor.userId as number,
            callNumber: decision.callNumber,
            calledAt: now,
          });

          // auditoría en la misma transacción; metadata sin nada clínico
          await this.auditService.record(
            {
              actor,
              action: AuditAction.CALL_PATIENT,
              resourceType: 'appointment',
              resourceId: appointmentId,
              patientId: appointment.patientId,
              metadata: {
                callNumber: decision.callNumber,
                officeId: appointment.officeId,
              },
            },
            manager,
          );

          return {
            result: this.toResult(decision.callNumber, now, office.name),
            payload: this.toPayload(
              appointment,
              patient,
              office.name,
              decision.callNumber,
              now,
            ),
          };
        },
      );

      // DESPUÉS del commit; un fallo del canal no afecta el llamado ya hecho
      this.eventEmitter
        .emitAsync(AppointmentEvents.CALLED, payload)
        .catch((error) =>
          clinicalErrorLogger.error(
            `[AppointmentCallsService.call] ${AppointmentEvents.CALLED} falló: ${error instanceof Error ? error.message : error}`,
          ),
        );

      return result;
    } catch (error) {
      handleServiceError(
        error,
        clinicalErrorLogger,
        'AppointmentCallsService.call',
        'Error al llamar al paciente',
        { appointmentId },
      );
    }
  }

  private toResult(
    callNumber: number,
    calledAt: Date,
    officeName: string,
  ): CallResult {
    return {
      callNumber,
      calledAt: calledAt.toISOString(),
      officeName,
      remainingCalls: MAX_CALLS_PER_APPOINTMENT - callNumber,
      nextCallInSeconds: MIN_SECONDS_BETWEEN_CALLS,
    };
  }

  private toPayload(
    appointment: AppointmentEntity,
    patient: PatientEntity,
    officeName: string,
    callNumber: number,
    calledAt: Date,
  ): AppointmentCalledPayload {
    return {
      appointmentId: appointment.id,
      appointmentCode: appointment.code,
      callNumber,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      officeName,
      calledAt: calledAt.toISOString(),
      calledTime: clinicNow().time,
    };
  }
}
