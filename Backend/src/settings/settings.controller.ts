import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Public } from '@/auth/decorators/public.decorator';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

@Controller('public/settings')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get()
  get() {
    return this.settingsService.getPublic();
  }
}

@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  get() {
    return this.settingsService.getAdmin();
  }

  @Patch()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  update(@Body() dto: UpdateSettingsDto, @CurrentActor() actor: Actor) {
    return this.settingsService.update(dto, actor);
  }
}
