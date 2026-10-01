import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pantallas de sala de espera (TV): cada una tiene un token PROPIO que solo
 * sirve para leer el stream de llamados. Se guarda únicamente el hash
 * SHA-256 del token (nunca el token): si se filtra la base, no sirve para
 * conectarse a ninguna pantalla.
 */
export class DisplayDevices1790710000000 implements MigrationInterface {
  name = 'DisplayDevices1790710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`display_devices\` (
        \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
        \`name\` varchar(80) NOT NULL,
        \`token_hash\` char(64) NOT NULL,
        \`active\` tinyint NOT NULL DEFAULT 1,
        \`last_seen_at\` datetime NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_display_devices_name\` (\`name\`),
        UNIQUE INDEX \`UQ_display_devices_token_hash\` (\`token_hash\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `display_devices`');
  }
}
