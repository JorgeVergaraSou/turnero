import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790341568465 implements MigrationInterface {
  name = 'InitialSchema1790341568465';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id_user\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`nick_usuario\` varchar(60) NOT NULL, \`nombre\` varchar(60) NOT NULL, \`apellido\` varchar(60) NOT NULL, \`email\` varchar(255) NULL, \`password\` varchar(255) NOT NULL, \`reset_password_token\` varchar(255) NULL, \`reset_password_token_expires_at\` datetime NULL, \`image_file\` varchar(255) NULL, \`role\` enum ('ADMIN', 'RECEPCIONISTA', 'MEDICO') NOT NULL, \`deleted_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_839c19267411d91feb43945a71\` (\`nick_usuario\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), UNIQUE INDEX \`IDX_ee6419219542371563e0592db5\` (\`reset_password_token\`), PRIMARY KEY (\`id_user\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_ee6419219542371563e0592db5\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_839c19267411d91feb43945a71\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
