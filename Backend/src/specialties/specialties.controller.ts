import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { CreateSpecialtyDto, UpdateSpecialtyDto } from './dto/specialty.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/** Sin DELETE a propósito: las especialidades se desactivan (PATCH active=false). */
@Controller('admin/specialties')
export class AdminSpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @RequirePermissions(Permission.SPECIALTIES_MANAGE)
  findAll() {
    return this.specialtiesService.findAll();
  }

  @Post()
  @RequirePermissions(Permission.SPECIALTIES_MANAGE)
  create(@Body() dto: CreateSpecialtyDto, @CurrentActor() actor: Actor) {
    return this.specialtiesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SPECIALTIES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecialtyDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.specialtiesService.update(id, dto, actor);
  }
}

@Controller('public/specialties')
export class PublicSpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Public()
  @Get()
  async findActive() {
    const specialties = await this.specialtiesService.findActive();
    return specialties.map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
  }
}
