import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recordatorios en dos etapas y confirmación de asistencia del paciente.
 *
 * - clinic_settings.second_reminder_hours_before: cuántas horas antes del
 *   turno sale el SEGUNDO aviso (el primero sigue siendo reminder_hours_before,
 *   24 por defecto). 0 = no se manda.
 * - appointments.reminder2_sent_at: igual que reminder_sent_at, para el
 *   segundo aviso (reclamo atómico: nunca dos avisos de la misma etapa).
 * - appointments.patient_confirmed_at: el paciente avisó que va a venir (por el
 *   enlace del recordatorio). Es un dato APARTE del estado del turno: el
 *   estado CONFIRMADO sigue significando "llegó y está en la sala".
 */
export class ReminderStages1790760000000 implements MigrationInterface {
  name = 'ReminderStages1790760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `clinic_settings` ADD `second_reminder_hours_before` smallint UNSIGNED NOT NULL DEFAULT 2',
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings ADD CONSTRAINT CHK_clinic_settings_second_reminder CHECK (second_reminder_hours_before BETWEEN 0 AND 72)',
    );
    await queryRunner.query(
      'ALTER TABLE `appointments` ADD `reminder2_sent_at` datetime NULL, ADD `patient_confirmed_at` datetime NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` DROP COLUMN `patient_confirmed_at`, DROP COLUMN `reminder2_sent_at`',
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings DROP CHECK CHK_clinic_settings_second_reminder',
    );
    await queryRunner.query(
      'ALTER TABLE `clinic_settings` DROP COLUMN `second_reminder_hours_before`',
    );
  }
}
