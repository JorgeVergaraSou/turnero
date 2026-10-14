import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { PublishPrivacyNoticeDto } from './dto/publish-privacy-notice.dto';
import { Public } from '@/auth/decorators/public.decorator';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/** El aviso vigente: lo lee la reserva (para la casilla) y la página /privacidad. */
@Controller('public/privacy-notice')
export class PublicPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Public()
  @Get()
  // sin caché: cuando el administrador publica una versión nueva, rige al instante
  @Header('Cache-Control', 'no-store')
  current() {
    return this.privacy.getCurrent();
  }
}

/**
 * Textos del aviso, administrables desde Configuración. Son textos legales,
 * no datos clínicos. Sin PUT/DELETE a propósito: las versiones publicadas no
 * se editan; cada cambio es una versión nueva.
 */
@Controller('admin/privacy-notices')
export class AdminPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  list() {
    return this.privacy.list();
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  publish(@Body() dto: PublishPrivacyNoticeDto, @CurrentActor() actor: Actor) {
    return this.privacy.publish(dto, actor);
  }
}
