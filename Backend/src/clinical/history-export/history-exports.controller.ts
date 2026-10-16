import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ParseIdPipe } from '@/common/pipes/parse-id.pipe';
import type { Response } from 'express';
import { HistoryExportsService } from './history-exports.service';
import {
  CancelHistoryExportDto,
  CreateHistoryExportDto,
  IssueHistoryExportDto,
  ReassignHistoryExportDto,
} from './history-export.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';

const scopeOf = (scope?: string) => (scope === 'all' ? 'all' : 'open');

/**
 * Pedidos de copia de la historia clínica: lado administrativo. Recepción
 * los registra y cancela; recepción y administración ven su estado;
 * administración reasigna el médico. NADA clínico pasa por acá: el PDF solo
 * lo genera el médico (DoctorHistoryExportsController).
 */
@Controller('admin/history-exports')
export class AdminHistoryExportsController {
  constructor(private readonly service: HistoryExportsService) {}

  @Get()
  @RequirePermissions(Permission.HISTORY_EXPORT_TRACK)
  list(@Query('scope') scope?: string) {
    return this.service.list(scopeOf(scope));
  }

  @Get('summary')
  @RequirePermissions(Permission.HISTORY_EXPORT_TRACK)
  summary() {
    return this.service.summary();
  }

  /** Médicos que atendieron al paciente (los únicos que pueden emitir su copia). */
  @Get('candidates')
  @RequirePermissions(Permission.HISTORY_EXPORT_TRACK)
  candidates(@Query('patientId', ParseIdPipe) patientId: number) {
    return this.service.candidates(patientId);
  }

  @Post()
  @RequirePermissions(Permission.HISTORY_EXPORT_REQUEST)
  create(@Body() dto: CreateHistoryExportDto, @CurrentActor() actor: Actor) {
    return this.service.create(dto, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.HISTORY_EXPORT_REQUEST)
  cancel(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CancelHistoryExportDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.cancel(id, dto, actor);
  }

  @Patch(':id/reassign')
  @RequirePermissions(Permission.HISTORY_EXPORT_REASSIGN)
  reassign(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: ReassignHistoryExportDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.reassign(id, dto.professionalId, actor);
  }
}

/**
 * Lado del médico: ve solo los pedidos que le asignaron, genera el PDF
 * (con relación médico↔paciente) y confirma la entrega.
 */
@Controller('doctor/history-exports')
export class DoctorHistoryExportsController {
  constructor(private readonly service: HistoryExportsService) {}

  @Get()
  @RequirePermissions(Permission.HISTORY_EXPORT_ISSUE)
  async list(@CurrentActor() actor: Actor, @Query('scope') scope?: string) {
    return this.service.list(
      scopeOf(scope),
      await this.service.myProfessionalId(actor),
    );
  }

  @Get('summary')
  @RequirePermissions(Permission.HISTORY_EXPORT_ISSUE)
  async summary(@CurrentActor() actor: Actor) {
    return this.service.summary(await this.service.myProfessionalId(actor));
  }

  /**
   * Genera y descarga la copia. POST (no GET): cada llamada registra una
   * emisión. Sin caché y sin guardar nada en disco.
   */
  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.HISTORY_EXPORT_ISSUE)
  async issue(
    @Param('id', ParseIdPipe) id: number,
    @Body() _dto: IssueHistoryExportDto,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.service.issue(id, actor);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.HISTORY_EXPORT_ISSUE)
  deliver(@Param('id', ParseIdPipe) id: number, @CurrentActor() actor: Actor) {
    return this.service.deliver(id, actor);
  }
}
