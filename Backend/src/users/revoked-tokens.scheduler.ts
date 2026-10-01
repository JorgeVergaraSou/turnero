import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from './users.service';
import { usersErrorLogger } from '@/config/module-loggers';

/**
 * Cada hora borra las sesiones anuladas que ya vencieron (un JWT vencido
 * se rechaza solo; guardarlo no aporta nada). DISABLE_SCHEDULED_JOBS=true
 * la apaga, como las demás tareas programadas.
 */
@Injectable()
export class RevokedTokensScheduler {
  private readonly logger = new Logger(RevokedTokensScheduler.name);

  constructor(private readonly usersService: UsersService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'revoked-tokens-cleanup' })
  async run(): Promise<void> {
    if (process.env.DISABLE_SCHEDULED_JOBS === 'true') return;
    try {
      const deleted = await this.usersService.deleteExpiredRevokedTokens();
      if (deleted > 0) {
        this.logger.log(`Sesiones anuladas vencidas borradas: ${deleted}`);
      }
    } catch (error) {
      usersErrorLogger.error(
        `[RevokedTokensScheduler] ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
