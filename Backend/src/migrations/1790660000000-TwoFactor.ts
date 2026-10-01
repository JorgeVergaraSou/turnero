import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación en dos pasos (TOTP): secreto cifrado, fecha de activación,
 * último paso usado (anti-reuso) y huellas de los códigos de recuperación
 * en users; roles obligados en clinic_settings (vacío = ninguno).
 * Generada con migration:generate.
 */
export class TwoFactor1790660000000 implements MigrationInterface {
  name = 'TwoFactor1790660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`two_factor_secret\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`two_factor_enabled_at\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`two_factor_last_step\` int UNSIGNED NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`two_factor_recovery_codes\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clinic_settings\` ADD \`two_factor_roles\` varchar(60) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`clinic_settings\` DROP COLUMN \`two_factor_roles\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`two_factor_recovery_codes\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`two_factor_last_step\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`two_factor_enabled_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`two_factor_secret\``,
    );
  }
}
