import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Número de afiliado: en el legajo (lo carga recepción, o el paciente
 * nuevo al reservar) y el declarado en cada reserva. Opcional.
 * Generada con migration:generate.
 */
export class HealthInsuranceNumber1790630000000 implements MigrationInterface {
  name = 'HealthInsuranceNumber1790630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`patients\` ADD \`health_insurance_number\` varchar(40) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD \`contact_health_insurance_number\` varchar(40) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP COLUMN \`contact_health_insurance_number\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`patients\` DROP COLUMN \`health_insurance_number\``,
    );
  }
}
