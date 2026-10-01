import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recordatorios de turno: marca de "recordatorio emitido" por turno y
 * anticipación configurable (horas antes; 0 = desactivado). El CHECK va a
 * mano: TypeORM ignora @Check en MySQL.
 */
export class AppointmentReminders1790590213106 implements MigrationInterface {
  name = 'AppointmentReminders1790590213106';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `clinic_settings` ADD `reminder_hours_before` smallint UNSIGNED NOT NULL DEFAULT '24'",
    );
    await queryRunner.query(
      'ALTER TABLE `appointments` ADD `reminder_sent_at` datetime NULL',
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings ADD CONSTRAINT CHK_clinic_settings_reminder_hours CHECK (reminder_hours_before BETWEEN 0 AND 72)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE clinic_settings DROP CHECK CHK_clinic_settings_reminder_hours',
    );
    await queryRunner.query(
      'ALTER TABLE `appointments` DROP COLUMN `reminder_sent_at`',
    );
    await queryRunner.query(
      'ALTER TABLE `clinic_settings` DROP COLUMN `reminder_hours_before`',
    );
  }
}
