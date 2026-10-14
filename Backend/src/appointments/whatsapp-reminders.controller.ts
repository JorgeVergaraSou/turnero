import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { WhatsAppRemindersService } from './whatsapp-reminders.service';
import type { WhatsAppOutcome } from './whatsapp-reminders.service';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

export class MarkWhatsAppReminderDto {
  /** SENT: recepción abrió el chat; SKIPPED: decidió no avisar por este medio */
  @IsOptional()
  @IsIn(['SENT', 'SKIPPED'])
  outcome?: WhatsAppOutcome;
}

/**
 * Avisos por WhatsApp que recepción hace a mano (enlace wa.me con el mensaje
 * armado). Ver pendientes: mismo permiso que ver la agenda; marcarlos: el de
 * gestionar turnos.
 */
@Controller('admin/whatsapp-reminders')
export class WhatsAppRemindersController {
  constructor(private readonly service: WhatsAppRemindersService) {}

  @Get()
  @RequirePermissions(Permission.APPOINTMENTS_READ)
  list() {
    return this.service.listDue();
  }

  @Post(':id/:stage/mark')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.APPOINTMENTS_MANAGE)
  mark(
    @Param('id', ParseIntPipe) id: number,
    @Param('stage', ParseIntPipe) stage: number,
    @Body() dto: MarkWhatsAppReminderDto,
    @CurrentActor() actor: Actor,
  ) {
    if (stage !== 1 && stage !== 2) {
      // misma respuesta que un id inválido
      throw new BadRequestException('La etapa tiene que ser 1 o 2.');
    }
    return this.service.mark(id, stage, dto.outcome ?? 'SENT', actor);
  }
}
