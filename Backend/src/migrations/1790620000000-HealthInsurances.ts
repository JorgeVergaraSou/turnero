import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Obras sociales: catálogo administrable, la del legajo del paciente y la
 * declarada al reservar (como el resto del contacto del turno). NULL =
 * particular. Generada con migration:generate.
 */
export class HealthInsurances1790620000000 implements MigrationInterface {
  name = 'HealthInsurances1790620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`health_insurances\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`name\` varchar(100) NOT NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_a47d91fd5781101c3b4c51ca2c\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`patients\` ADD \`health_insurance_id\` int UNSIGNED NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD \`contact_health_insurance_id\` int UNSIGNED NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`patients\` ADD CONSTRAINT \`FK_e87cfac49894253178e25ba5a1c\` FOREIGN KEY (\`health_insurance_id\`) REFERENCES \`health_insurances\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_a5fd54b0dcdf9ff4b182a8fcfa0\` FOREIGN KEY (\`contact_health_insurance_id\`) REFERENCES \`health_insurances\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_a5fd54b0dcdf9ff4b182a8fcfa0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`patients\` DROP FOREIGN KEY \`FK_e87cfac49894253178e25ba5a1c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP COLUMN \`contact_health_insurance_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`patients\` DROP COLUMN \`health_insurance_id\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_a47d91fd5781101c3b4c51ca2c\` ON \`health_insurances\``,
    );
    await queryRunner.query(`DROP TABLE \`health_insurances\``);
  }
}
