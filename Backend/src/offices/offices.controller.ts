import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { OfficesService } from './offices.service';
import { CreateOfficeDto, UpdateOfficeDto } from './dto/office.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/** Sin DELETE a propósito: los consultorios se desactivan (PATCH active=false). */
@Controller('admin/offices')
export class AdminOfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @Get()
  @RequirePermissions(Permission.SCHEDULES_READ)
  findAll() {
    return this.officesService.findAll();
  }

  @Post()
  @RequirePermissions(Permission.OFFICES_MANAGE)
  create(@Body() dto: CreateOfficeDto, @CurrentActor() actor: Actor) {
    return this.officesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.OFFICES_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfficeDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.officesService.update(id, dto, actor);
  }
}
