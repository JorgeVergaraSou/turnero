import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import {
  CreateScheduleDto,
  CreateScheduleExceptionDto,
  UpdateScheduleDto,
  UpdateScheduleExceptionDto,
} from './dto/schedule.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';
import { OptionalIntPipe } from '@/common/pipes/optional-int.pipe';
import { OptionalDatePipe } from '@/common/pipes/optional-date.pipe';

/** Sin DELETE: horarios y excepciones se desactivan (PATCH active=false). */
@Controller('admin/schedules')
export class AdminSchedulesController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULES_READ)
  findAll(@Query('professionalId', OptionalIntPipe) professionalId?: number) {
    return this.schedulingService.findSchedules(professionalId);
  }

  @Post()
  @RequirePermissions(Permission.SCHEDULES_MANAGE)
  create(@Body() dto: CreateScheduleDto, @CurrentActor() actor: Actor) {
    return this.schedulingService.createSchedule(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SCHEDULES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.schedulingService.updateSchedule(id, dto, actor);
  }
}

@Controller('admin/schedule-exceptions')
export class AdminScheduleExceptionsController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULES_READ)
  findAll(
    @Query('professionalId', OptionalIntPipe) professionalId?: number,
    @Query('from', OptionalDatePipe) from?: string,
    @Query('to', OptionalDatePipe) to?: string,
  ) {
    return this.schedulingService.findExceptions({ professionalId, from, to });
  }

  @Post()
  @RequirePermissions(Permission.SCHEDULES_MANAGE)
  create(
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.schedulingService.createException(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SCHEDULES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleExceptionDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.schedulingService.updateException(id, dto, actor);
  }
}
