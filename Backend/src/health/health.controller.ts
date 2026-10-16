import { Controller, Get, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '@/auth/decorators/public.decorator';

/**
 * Chequeo de salud para el monitoreo (uptime, balanceador, systemd): 200 si la
 * API responde y la base contesta, 503 si no. Público y sin detalles: no
 * revela versiones, nombres de base ni el motivo del fallo (eso queda en el
 * log del servidor).
 */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      res.status(503);
      return { status: 'error' };
    }
  }
}
