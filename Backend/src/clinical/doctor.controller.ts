import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { AppointmentCallsService } from './appointment-calls.service';
import { ClinicalAccessService } from './clinical-access.service';
import {
  CreateAmendmentDto,
  UpdateConsultationDto,
} from './dto/consultation.dto';
import { AppointmentsService } from '@/appointments/appointments.service';
import { AppointmentStatus } from '@/appointments/appointment-status';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';
import { OptionalDatePipe } from '@/common/pipes/optional-date.pipe';
import { clinicNow } from '@/common/utils/clinic-time.util';

/**
 * Panel médico. Todo usa @RequirePermissions (no @Auth): ADMIN no entra
 * acá por ser ADMIN. Además, cada acceso a un paciente pasa por
 * ClinicalAccessService (relación médico↔paciente) y cada turno/consulta
 * se valida contra el profesional logueado — nunca se confía en un id de
 * la URL.
 */
@Controller('doctor')
export class DoctorController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly appointmentsService: AppointmentsService,
    private readonly appointmentCallsService: AppointmentCallsService,
  ) {}

  @Get('me')
  @RequirePermissions(Permission.OWN_AGENDA_READ)
  async me(@CurrentActor() actor: Actor) {
    const professional = await this.clinicalAccess.requireProfessional(actor);
    return {
      id: professional.id,
      firstName: professional.user.nombre,
      lastName: professional.user.apellido,
      licenseNumber: professional.licenseNumber,
      specialties: professional.specialties.map(({ id, name }) => ({
        id,
        name,
      })),
    };
  }

  /** Agenda propia. Siempre filtrada por el profesional del token. */
  @Get('appointments')
  @RequirePermissions(Permission.OWN_AGENDA_READ)
  async agenda(
    @CurrentActor() actor: Actor,
    @Query('from', OptionalDatePipe) from?: string,
    @Query('to', OptionalDatePipe) to?: string,
  ) {
    const professional = await this.clinicalAccess.requireProfessional(actor);
    const start = from ?? clinicNow().date;
    return this.appointmentsService.listForProfessional(
      professional.id,
      start,
      to ?? start,
    );
  }

  @Get('dashboard')
  @RequirePermissions(Permission.OWN_AGENDA_READ)
  async dashboard(
    @CurrentActor() actor: Actor,
    @Query('date', OptionalDatePipe) date?: string,
  ) {
    const professional = await this.clinicalAccess.requireProfessional(actor);
    const day = date ?? clinicNow().date;
    const appointments = await this.appointmentsService.listForProfessional(
      professional.id,
      day,
      day,
    );
    const count = (...statuses: AppointmentStatus[]) =>
      appointments.filter((a) => statuses.includes(a.status)).length;
    return {
      date: day,
      now: clinicNow(),
      counts: {
        total: appointments.length,
        pending: count(
          AppointmentStatus.RESERVADO,
          AppointmentStatus.CONFIRMADO,
        ),
        inAttention: count(AppointmentStatus.EN_ATENCION),
        attended: count(AppointmentStatus.ATENDIDO),
        cancelled: count(AppointmentStatus.CANCELADO),
        noShow: count(AppointmentStatus.AUSENTE),
      },
      appointments,
    };
  }

  @Get('patients')
  @RequirePermissions(Permission.CLINICAL_READ)
  myPatients(@CurrentActor() actor: Actor, @Query('q') q?: string) {
    return this.consultationsService.listMyPatients(actor, q);
  }

  @Get('patients/:id')
  @RequirePermissions(Permission.CLINICAL_READ)
  patient(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: Actor) {
    return this.consultationsService.getPatient(id, actor);
  }

  @Get('patients/:id/clinical-history')
  @RequirePermissions(Permission.CLINICAL_READ)
  clinicalHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.consultationsService.getClinicalHistory(
      id,
      actor,
      Math.max(1, page),
      Math.min(Math.max(1, limit), 50),
    );
  }

  @Post('appointments/:id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(
    Permission.CONSULTATIONS_ATTEND,
    Permission.CLINICAL_WRITE,
  )
  start(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: Actor) {
    return this.consultationsService.startAttention(id, actor);
  }

  /**
   * Llama (o vuelve a llamar) a un paciente en sala de espera. El primer
   * llamado y las repeticiones usan el mismo endpoint.
   */
  @Post('appointments/:id/call')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CALLS_MAKE)
  call(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: Actor) {
    return this.appointmentCallsService.call(id, actor);
  }

  @Get('appointments/:id/consultation')
  @RequirePermissions(Permission.CLINICAL_READ)
  consultationOfAppointment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ) {
    return this.consultationsService.findByAppointment(id, actor);
  }

  @Get('consultations/:id')
  @RequirePermissions(Permission.CLINICAL_READ)
  consultation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ) {
    return this.consultationsService.findOne(id, actor);
  }

  @Patch('consultations/:id')
  @RequirePermissions(Permission.CLINICAL_WRITE)
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsultationDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.consultationsService.updateDraft(id, dto, actor);
  }

  @Post('consultations/:id/finalize')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(
    Permission.CONSULTATIONS_ATTEND,
    Permission.CLINICAL_WRITE,
  )
  finalize(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ) {
    return this.consultationsService.finalize(id, actor);
  }

  @Post('consultations/:id/amendments')
  @RequirePermissions(Permission.CLINICAL_WRITE)
  amend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAmendmentDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.consultationsService.addAmendment(id, dto, actor);
  }
}
