import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DisplayDevicesService } from './display-devices.service';
import { DisplayStreamService } from './display-stream.service';
import { DeviceAuth } from './decorators/device-auth.decorator';
import type { DisplayDeviceContext } from './display-token.guard';
import {
  CreateDisplayDeviceDto,
  UpdateDisplayDeviceDto,
} from './dto/display-device.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/**
 * Administración de las pantallas de sala. Sin DELETE a propósito: se
 * desactivan (PATCH active=false), que también corta su stream abierto.
 * El token se devuelve UNA sola vez (al crear o rotar).
 */
@Controller('admin/display-devices')
export class AdminDisplayDevicesController {
  constructor(private readonly devices: DisplayDevicesService) {}

  @Get()
  @RequirePermissions(Permission.DISPLAYS_MANAGE)
  findAll() {
    return this.devices.findAll();
  }

  @Post()
  @RequirePermissions(Permission.DISPLAYS_MANAGE)
  create(@Body() dto: CreateDisplayDeviceDto, @CurrentActor() actor: Actor) {
    return this.devices.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DISPLAYS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisplayDeviceDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.devices.update(id, dto, actor);
  }

  @Post(':id/rotate-token')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DISPLAYS_MANAGE)
  rotateToken(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ) {
    return this.devices.rotateToken(id, actor);
  }
}

/**
 * Stream de llamados para la TV (Server-Sent Events). Autenticado SOLO con
 * el token de pantalla por cabecera `Authorization: Bearer dsp_…` — el
 * cliente tiene que usar fetch con stream (el EventSource del navegador no
 * puede mandar cabeceras). Detrás de nginx hace falta `proxy_buffering off`
 * (Nest ya manda `X-Accel-Buffering: no`).
 */
@Controller('display')
export class DisplayStreamController {
  constructor(
    private readonly stream: DisplayStreamService,
    private readonly devices: DisplayDevicesService,
  ) {}

  @Sse('stream')
  @DeviceAuth()
  open(
    @Req() request: { displayDevice: DisplayDeviceContext },
  ): Observable<MessageEvent> {
    this.devices.touch(request.displayDevice.id);
    return this.stream.open(request.displayDevice.id);
  }
}
