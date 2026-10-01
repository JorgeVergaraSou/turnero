import { MigrationInterface, QueryRunner } from 'typeorm';

export class Clinical1790344019575 implements MigrationInterface {
  name = 'Clinical1790344019575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`consultation_diagnoses\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`consultation_id\` int UNSIGNED NOT NULL, \`type\` enum ('PRINCIPAL', 'SECUNDARIO') NOT NULL, \`description\` varchar(500) NOT NULL, \`code_system\` varchar(20) NULL, \`code\` varchar(20) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`consultation_medications\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`consultation_id\` int UNSIGNED NOT NULL, \`drug_name\` varchar(200) NOT NULL, \`dose\` varchar(100) NULL, \`frequency\` varchar(100) NULL, \`duration\` varchar(100) NULL, \`notes\` varchar(500) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`consultation_study_requests\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`consultation_id\` int UNSIGNED NOT NULL, \`type\` enum ('LABORATORIO', 'RADIOGRAFIA', 'ECOGRAFIA', 'RESONANCIA', 'OTRO') NOT NULL, \`description\` varchar(500) NOT NULL, \`notes\` varchar(500) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`consultation_amendments\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`consultation_id\` int UNSIGNED NOT NULL, \`author_user_id\` int UNSIGNED NOT NULL, \`content\` text NOT NULL, \`reason\` varchar(500) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`medical_consultations\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`appointment_id\` int UNSIGNED NOT NULL, \`patient_id\` int UNSIGNED NOT NULL, \`professional_id\` int UNSIGNED NOT NULL, \`status\` enum ('BORRADOR', 'FINALIZADA') NOT NULL DEFAULT 'BORRADOR', \`reason\` text NULL, \`anamnesis\` text NULL, \`physical_exam\` text NULL, \`evolution\` text NULL, \`indications\` text NULL, \`observations\` text NULL, \`weight_kg\` decimal(5,2) NULL, \`height_cm\` decimal(5,1) NULL, \`systolic_bp\` smallint UNSIGNED NULL, \`diastolic_bp\` smallint UNSIGNED NULL, \`heart_rate\` smallint UNSIGNED NULL, \`temperature_c\` decimal(4,1) NULL, \`oxygen_saturation\` tinyint UNSIGNED NULL, \`started_at\` datetime NOT NULL, \`created_by_user_id\` int UNSIGNED NOT NULL, \`finalized_at\` datetime NULL, \`finalized_by_user_id\` int UNSIGNED NULL, \`content_hash\` char(64) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_consultations_professional\` (\`professional_id\`, \`started_at\`), INDEX \`IDX_consultations_patient\` (\`patient_id\`, \`started_at\`), UNIQUE INDEX \`IDX_d76a2cddd5b6bafc943f730557\` (\`appointment_id\`), UNIQUE INDEX \`REL_d76a2cddd5b6bafc943f730557\` (\`appointment_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_diagnoses\` ADD CONSTRAINT \`FK_4be11c6d1849693d723ff123ad6\` FOREIGN KEY (\`consultation_id\`) REFERENCES \`medical_consultations\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_medications\` ADD CONSTRAINT \`FK_27b55a54ad70314274052b39f01\` FOREIGN KEY (\`consultation_id\`) REFERENCES \`medical_consultations\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_study_requests\` ADD CONSTRAINT \`FK_e0c762168a537975cca03e79faf\` FOREIGN KEY (\`consultation_id\`) REFERENCES \`medical_consultations\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_amendments\` ADD CONSTRAINT \`FK_17588ea898cbe493155bc718f7d\` FOREIGN KEY (\`consultation_id\`) REFERENCES \`medical_consultations\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` ADD CONSTRAINT \`FK_d76a2cddd5b6bafc943f7305577\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` ADD CONSTRAINT \`FK_24c48a99ceda726ae76021dfded\` FOREIGN KEY (\`patient_id\`) REFERENCES \`patients\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` ADD CONSTRAINT \`FK_bb6e27d32d4f5fdf65de40d936c\` FOREIGN KEY (\`professional_id\`) REFERENCES \`professionals\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` DROP FOREIGN KEY \`FK_bb6e27d32d4f5fdf65de40d936c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` DROP FOREIGN KEY \`FK_24c48a99ceda726ae76021dfded\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`medical_consultations\` DROP FOREIGN KEY \`FK_d76a2cddd5b6bafc943f7305577\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_amendments\` DROP FOREIGN KEY \`FK_17588ea898cbe493155bc718f7d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_study_requests\` DROP FOREIGN KEY \`FK_e0c762168a537975cca03e79faf\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_medications\` DROP FOREIGN KEY \`FK_27b55a54ad70314274052b39f01\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`consultation_diagnoses\` DROP FOREIGN KEY \`FK_4be11c6d1849693d723ff123ad6\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_d76a2cddd5b6bafc943f730557\` ON \`medical_consultations\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_d76a2cddd5b6bafc943f730557\` ON \`medical_consultations\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_consultations_patient\` ON \`medical_consultations\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_consultations_professional\` ON \`medical_consultations\``,
    );
    await queryRunner.query(`DROP TABLE \`medical_consultations\``);
    await queryRunner.query(`DROP TABLE \`consultation_amendments\``);
    await queryRunner.query(`DROP TABLE \`consultation_study_requests\``);
    await queryRunner.query(`DROP TABLE \`consultation_medications\``);
    await queryRunner.query(`DROP TABLE \`consultation_diagnoses\``);
  }
}
