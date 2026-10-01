import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cerrar sesión de verdad (revoked_tokens: JWT anulados hasta que vencen)
 * y bloqueo de cuenta por intentos fallidos (failed_login_count,
 * locked_until). Generada con migration:generate.
 */
export class SessionsAndLockout1790650000000 implements MigrationInterface {
  name = 'SessionsAndLockout1790650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`revoked_tokens\` (\`jti\` char(36) NOT NULL, \`user_id\` int UNSIGNED NOT NULL, \`expires_at\` datetime NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_revoked_tokens_expires_at\` (\`expires_at\`), PRIMARY KEY (\`jti\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`failed_login_count\` smallint UNSIGNED NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`locked_until\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`locked_until\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`failed_login_count\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_revoked_tokens_expires_at\` ON \`revoked_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`revoked_tokens\``);
  }
}
