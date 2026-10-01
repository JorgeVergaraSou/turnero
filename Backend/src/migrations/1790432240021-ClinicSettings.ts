import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicSettings1790432240021 implements MigrationInterface {
  name = 'ClinicSettings1790432240021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`clinic_settings\` (\`id\` tinyint UNSIGNED NOT NULL, \`clinic_name\` varchar(100) NOT NULL, \`contact_phone\` varchar(30) NULL, \`public_booking_enabled\` tinyint NOT NULL DEFAULT 1, \`booking_horizon_days\` smallint UNSIGNED NOT NULL DEFAULT '90', \`public_cancel_min_hours\` smallint UNSIGNED NOT NULL DEFAULT '0', \`updated_by_user_id\` int UNSIGNED NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // Hecho a mano (migration:generate no los detecta): fila única con los
    // valores por defecto, y CHECKs de rangos (TypeORM ignora @Check en MySQL).
    await queryRunner.query(
      "INSERT INTO clinic_settings (id, clinic_name) VALUES (1, 'Consultorio')",
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings ' +
        'ADD CONSTRAINT CHK_clinic_settings_single_row CHECK (id = 1), ' +
        'ADD CONSTRAINT CHK_clinic_settings_horizon CHECK (booking_horizon_days BETWEEN 1 AND 365), ' +
        'ADD CONSTRAINT CHK_clinic_settings_cancel_hours CHECK (public_cancel_min_hours BETWEEN 0 AND 168)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`clinic_settings\``);
  }
}
