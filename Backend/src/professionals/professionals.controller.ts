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
import { ProfessionalsService } from './professionals.service';
import {
  CreateProfessionalDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';
import { OptionalIntPipe } from '@/common/pipes/optional-int.pipe';

/** Sin DELETE a propósito: los profesionales se desactivan (PATCH active=false). */
@Controller('admin/professionals')
export class AdminProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULES_READ)
  findAll() {
    return this.professionalsService.findAll();
  }

  /** usuarios MEDICO sin perfil profesional todavía (para el alta) */
  @Get('eligible-users')
  @RequirePermissions(Permission.PROFESSIONALS_MANAGE)
  findEligibleUsers() {
    return this.professionalsService.findEligibleUsers();
  }

  @Get(':id')
  @RequirePermissions(Permission.SCHEDULES_READ)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.professionalsService.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.PROFESSIONALS_MANAGE)
  create(@Body() dto: CreateProfessionalDto, @CurrentActor() actor: Actor) {
    return this.professionalsService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PROFESSIONALS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfessionalDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.professionalsService.update(id, dto, actor);
  }
}

@Controller('public/professionals')
export class PublicProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Public()
  @Get()
  findBookable(@Query('specialtyId', OptionalIntPipe) specialtyId?: number) {
    return this.professionalsService.findBookable(specialtyId);
  }
}
