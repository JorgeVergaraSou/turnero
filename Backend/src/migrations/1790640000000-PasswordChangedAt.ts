import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha del último cambio de contraseña: el AuthGuard rechaza los JWT
 * emitidos antes (una sesión robada deja de servir al cambiar la clave).
 * Generada con migration:generate.
 */
export class PasswordChangedAt1790640000000 implements MigrationInterface {
  name = 'PasswordChangedAt1790640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`password_changed_at\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`password_changed_at\``,
    );
  }
}
