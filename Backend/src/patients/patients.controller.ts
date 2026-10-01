import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/**
 * Datos ADMINISTRATIVOS de pacientes (recepción/admin). Nada clínico sale
 * por acá. Sin DELETE: un paciente con historia clínica no se borra.
 */
@Controller('admin/patients')
export class AdminPatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @RequirePermissions(Permission.PATIENTS_READ)
  search(
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.patientsService.search(
      q,
      Math.max(1, page),
      Math.min(Math.max(1, limit), 100),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.PATIENTS_READ)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.PATIENTS_WRITE)
  create(@Body() dto: CreatePatientDto, @CurrentActor() actor: Actor) {
    return this.patientsService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PATIENTS_WRITE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.patientsService.update(id, dto, actor);
  }
}
