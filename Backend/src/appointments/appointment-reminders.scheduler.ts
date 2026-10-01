import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { appointmentsErrorLogger } from '@/config/module-loggers';

/**
 * Tarea programada: cada 10 minutos emite los recordatorios que
 * correspondan (ver AppointmentRemindersService). Con varias instancias de
 * la API corre en todas, y está bien: el reclamo atómico evita duplicados.
 *
 * DISABLE_SCHEDULED_JOBS=true la apaga (lo usan los e2e, que llaman al
 * service directamente para no depender del reloj).
 */
@Injectable()
export class AppointmentRemindersScheduler {
  private readonly logger = new Logger(AppointmentRemindersScheduler.name);
  private running = false;

  constructor(private readonly remindersService: AppointmentRemindersService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'appointment-reminders' })
  async run(): Promise<void> {
    if (process.env.DISABLE_SCHEDULED_JOBS === 'true' || this.running) {
      return;
    }
    this.running = true;
    try {
      const sent = await this.remindersService.sendDueReminders();
      if (sent.length > 0) {
        this.logger.log(`Recordatorios de turno emitidos: ${sent.length}`);
      }
    } catch (error) {
      appointmentsErrorLogger.error(
        `[AppointmentRemindersScheduler] ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running = false;
    }
  }
}
