import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgendaStreamService } from './agenda-stream.service';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

/**
 * Avisos de cambios en la agenda para recepción y administración (todos los
 * turnos). Mismo permiso que ver la agenda. El cliente usa fetch con stream
 * (EventSource no puede mandar la cabecera Authorization). El panel del médico
 * tiene el suyo, filtrado por su perfil profesional, en el módulo clínico.
 */
@Controller('admin/agenda')
export class AdminAgendaStreamController {
  constructor(private readonly stream: AgendaStreamService) {}

  @Sse('stream')
  @RequirePermissions(Permission.APPOINTMENTS_READ)
  open(@CurrentActor() actor: Actor): Observable<MessageEvent> {
    return this.stream.open(actor.userId!, null);
  }
}
