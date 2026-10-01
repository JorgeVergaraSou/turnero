import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import {
  CancelAppointmentDto,
  CreateAdminAppointmentDto,
  CreatePublicAppointmentDto,
  ListAppointmentsQueryDto,
  PublicAppointmentAccessDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';
import { Public } from '@/auth/decorators/public.decorator';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';
import { RequiredDatePipe } from '@/common/pipes/optional-date.pipe';

/**
 * Flujo público (paciente sin cuenta). Todo con rate limiting por IP:
 * reservar es la única escritura pública, y consultar/cancelar reciben un
 * código que no debe poder adivinarse por fuerza bruta.
 */
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('professionals/:id/availability')
  availability(
    @Param('id', ParseIntPipe) professionalId: number,
    @Query('from', RequiredDatePipe) from: string,
    @Query('to', RequiredDatePipe) to: string,
  ) {
    return this.appointmentsService.getPublicAvailability(
      professionalId,
      from,
      to,
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600000 } }) // 5 reservas cada 10 min por IP
  @Post('appointments')
  create(
    @Body() dto: CreatePublicAppointmentDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointmentsService.createPublic(dto, actor);
  }

  /** POST (no GET con el DNI en la URL): el DNI no queda en logs de acceso. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  @Post('appointments/lookup')
  lookup(
    @Body() dto: PublicAppointmentAccessDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointmentsService.lookupPublic(dto, actor);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  @Post('appointments/cancel')
  cancel(
    @Body() dto: PublicAppointmentAccessDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointmentsService.cancelPublic(dto, actor);
  }
}

/** Gestión de turnos (recepción / admin). */
@Controller('admin/appointments')
export class AdminAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @RequirePermissions(Permission.APPOINTMENTS_READ)
  list(@Query() query: ListAppointmentsQueryDto) {
    return this.appointmentsService.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.APPOINTMENTS_READ)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.findOneWithHistory(id);
  }

  @Post()
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  create(@Body() dto: CreateAdminAppointmentDto, @CurrentActor() actor: Actor) {
    return this.appointmentsService.createByReception(dto, actor);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  confirm(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: Actor) {
    return this.appointmentsService.confirm(id, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelAppointmentDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointmentsService.cancel(id, dto.reason, actor);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  noShow(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: Actor) {
    return this.appointmentsService.markNoShow(id, actor);
  }

  @Patch(':id/reschedule')
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointmentsService.reschedule(id, dto, actor);
  }
}
