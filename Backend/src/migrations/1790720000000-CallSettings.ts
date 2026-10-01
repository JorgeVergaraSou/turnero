import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuración del llamado de pacientes: sistema activado o no, cómo se
 * nombra al paciente en la pantalla y la voz, y cuántas veces se repite la
 * voz. El CHECK va a mano: TypeORM ignora @Check en MySQL.
 */
export class CallSettings1790720000000 implements MigrationInterface {
  name = 'CallSettings1790720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `clinic_settings` ADD `calls_enabled` tinyint NOT NULL DEFAULT 1, ADD `call_name_format` enum ('FULL', 'ABBREVIATED', 'CODE') NOT NULL DEFAULT 'FULL', ADD `call_voice_repeats` tinyint UNSIGNED NOT NULL DEFAULT 2",
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings ADD CONSTRAINT CHK_clinic_settings_call_repeats CHECK (call_voice_repeats BETWEEN 1 AND 3)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE clinic_settings DROP CHECK CHK_clinic_settings_call_repeats',
    );
    await queryRunner.query(
      'ALTER TABLE `clinic_settings` DROP COLUMN `call_voice_repeats`, DROP COLUMN `call_name_format`, DROP COLUMN `calls_enabled`',
    );
  }
}
