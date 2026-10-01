import { MigrationInterface, QueryRunner } from 'typeorm';

export class Catalogs1790343251218 implements MigrationInterface {
  name = 'Catalogs1790343251218';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`audit_logs\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`actor_user_id\` int UNSIGNED NULL, \`action\` varchar(60) NOT NULL, \`resource_type\` varchar(40) NOT NULL, \`resource_id\` varchar(40) NULL, \`patient_id\` int UNSIGNED NULL, \`result\` enum ('SUCCESS', 'DENIED') NOT NULL, \`ip\` varchar(45) NULL, \`reason\` varchar(500) NULL, \`metadata\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_audit_logs_resource\` (\`resource_type\`, \`resource_id\`), INDEX \`IDX_audit_logs_actor\` (\`actor_user_id\`, \`created_at\`), INDEX \`IDX_audit_logs_patient\` (\`patient_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`specialties\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`name\` varchar(100) NOT NULL, \`description\` varchar(500) NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_565f38f8b0417c7dbd40e42978\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`professionals\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`user_id\` int UNSIGNED NOT NULL, \`license_number\` varchar(50) NOT NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_11ce20e0e9f03ab6ce35e95a61\` (\`user_id\`), UNIQUE INDEX \`IDX_db18821edc2d68b0973b7cf765\` (\`license_number\`), UNIQUE INDEX \`REL_11ce20e0e9f03ab6ce35e95a61\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`offices\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`name\` varchar(100) NOT NULL, \`address\` varchar(200) NOT NULL, \`location_details\` varchar(200) NULL, \`phone\` varchar(30) NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_88aa5ebfe59f99cc747ca00f54\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`professional_specialties\` (\`professional_id\` int UNSIGNED NOT NULL, \`specialty_id\` int UNSIGNED NOT NULL, INDEX \`IDX_df2ec3898f9c874a5e5278667f\` (\`professional_id\`), INDEX \`IDX_7ce1103c67ea34ec7c82115ff5\` (\`specialty_id\`), PRIMARY KEY (\`professional_id\`, \`specialty_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`professionals\` ADD CONSTRAINT \`FK_11ce20e0e9f03ab6ce35e95a615\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id_user\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`professional_specialties\` ADD CONSTRAINT \`FK_df2ec3898f9c874a5e5278667f0\` FOREIGN KEY (\`professional_id\`) REFERENCES \`professionals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`professional_specialties\` ADD CONSTRAINT \`FK_7ce1103c67ea34ec7c82115ff56\` FOREIGN KEY (\`specialty_id\`) REFERENCES \`specialties\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`professional_specialties\` DROP FOREIGN KEY \`FK_7ce1103c67ea34ec7c82115ff56\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`professional_specialties\` DROP FOREIGN KEY \`FK_df2ec3898f9c874a5e5278667f0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`professionals\` DROP FOREIGN KEY \`FK_11ce20e0e9f03ab6ce35e95a615\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_7ce1103c67ea34ec7c82115ff5\` ON \`professional_specialties\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_df2ec3898f9c874a5e5278667f\` ON \`professional_specialties\``,
    );
    await queryRunner.query(`DROP TABLE \`professional_specialties\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_88aa5ebfe59f99cc747ca00f54\` ON \`offices\``,
    );
    await queryRunner.query(`DROP TABLE \`offices\``);
    await queryRunner.query(
      `DROP INDEX \`REL_11ce20e0e9f03ab6ce35e95a61\` ON \`professionals\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_db18821edc2d68b0973b7cf765\` ON \`professionals\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_11ce20e0e9f03ab6ce35e95a61\` ON \`professionals\``,
    );
    await queryRunner.query(`DROP TABLE \`professionals\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_565f38f8b0417c7dbd40e42978\` ON \`specialties\``,
    );
    await queryRunner.query(`DROP TABLE \`specialties\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_audit_logs_patient\` ON \`audit_logs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_audit_logs_actor\` ON \`audit_logs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_audit_logs_resource\` ON \`audit_logs\``,
    );
    await queryRunner.query(`DROP TABLE \`audit_logs\``);
  }
}
