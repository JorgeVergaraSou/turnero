import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { HealthInsurancesService } from './health-insurances.service';
import {
  CreateHealthInsuranceDto,
  UpdateHealthInsuranceDto,
} from './dto/health-insurance.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/** Sin DELETE a propósito: las obras sociales se desactivan (PATCH active=false). */
@Controller('admin/health-insurances')
export class AdminHealthInsurancesController {
  constructor(private readonly service: HealthInsurancesService) {}

  /** lectura con PATIENTS_READ: recepción la necesita para el legajo */
  @Get()
  @RequirePermissions(Permission.PATIENTS_READ)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @RequirePermissions(Permission.HEALTH_INSURANCES_MANAGE)
  create(@Body() dto: CreateHealthInsuranceDto, @CurrentActor() actor: Actor) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.HEALTH_INSURANCES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHealthInsuranceDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.update(id, dto, actor);
  }
}

@Controller('public/health-insurances')
export class PublicHealthInsurancesController {
  constructor(private readonly service: HealthInsurancesService) {}

  @Public()
  @Get()
  async findActive() {
    const items = await this.service.findActive();
    return items.map(({ id, name }) => ({ id, name }));
  }
}
