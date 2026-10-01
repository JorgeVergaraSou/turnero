import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchedulingAndAppointments1790343754484
  implements MigrationInterface
{
  name = 'SchedulingAndAppointments1790343754484';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`schedules\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`professional_id\` int UNSIGNED NOT NULL, \`office_id\` int UNSIGNED NOT NULL, \`weekday\` tinyint UNSIGNED NOT NULL, \`start_time\` time NOT NULL, \`end_time\` time NOT NULL, \`slot_minutes\` smallint UNSIGNED NOT NULL, \`valid_from\` date NOT NULL, \`valid_until\` date NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_schedules_professional_weekday\` (\`professional_id\`, \`weekday\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`schedule_exceptions\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`professional_id\` int UNSIGNED NULL, \`type\` enum ('VACACIONES', 'FERIADO', 'LICENCIA', 'AUSENCIA', 'BLOQUEO', 'REUNION', 'HORARIO_ESPECIAL') NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`start_time\` time NULL, \`end_time\` time NULL, \`office_id\` int UNSIGNED NULL, \`slot_minutes\` smallint UNSIGNED NULL, \`reason\` varchar(255) NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`created_by_user_id\` int UNSIGNED NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_schedule_exceptions_range\` (\`start_date\`, \`end_date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`patients\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`first_name\` varchar(80) NOT NULL, \`last_name\` varchar(80) NOT NULL, \`document_number\` varchar(20) NOT NULL, \`phone\` varchar(30) NOT NULL, \`email\` varchar(150) NULL, \`birth_date\` date NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_patients_name\` (\`last_name\`, \`first_name\`), UNIQUE INDEX \`IDX_85bcb7ae36549e3eb85686078d\` (\`document_number\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`appointments\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`code\` char(10) NOT NULL, \`patient_id\` int UNSIGNED NOT NULL, \`professional_id\` int UNSIGNED NOT NULL, \`specialty_id\` int UNSIGNED NOT NULL, \`office_id\` int UNSIGNED NOT NULL, \`date\` date NOT NULL, \`start_time\` time NOT NULL, \`end_time\` time NOT NULL, \`status\` enum ('RESERVADO', 'CONFIRMADO', 'EN_ATENCION', 'ATENDIDO', 'CANCELADO', 'AUSENTE') NOT NULL DEFAULT 'RESERVADO', \`active_slot\` tinyint AS ((CASE WHEN \`status\` = 'CANCELADO' THEN NULL ELSE 1 END)) STORED NULL, \`source\` enum ('PUBLICO', 'RECEPCION') NOT NULL, \`contact_phone\` varchar(30) NOT NULL, \`contact_email\` varchar(150) NULL, \`cancellation_reason\` varchar(255) NULL, \`created_by_user_id\` int UNSIGNED NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_appointments_patient\` (\`patient_id\`, \`date\`), INDEX \`IDX_appointments_date_professional\` (\`date\`, \`professional_id\`), UNIQUE INDEX \`UQ_appointments_active_slot\` (\`professional_id\`, \`date\`, \`start_time\`, \`active_slot\`), UNIQUE INDEX \`IDX_d838dde2371446d33c990332cb\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`turnero\`.\`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        'turnero',
        'appointments',
        'GENERATED_COLUMN',
        'active_slot',
        "(CASE WHEN `status` = 'CANCELADO' THEN NULL ELSE 1 END)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`appointment_status_history\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`appointment_id\` int UNSIGNED NOT NULL, \`from_status\` enum ('RESERVADO', 'CONFIRMADO', 'EN_ATENCION', 'ATENDIDO', 'CANCELADO', 'AUSENTE') NULL, \`to_status\` enum ('RESERVADO', 'CONFIRMADO', 'EN_ATENCION', 'ATENDIDO', 'CANCELADO', 'AUSENTE') NOT NULL, \`from_date\` date NULL, \`from_start_time\` time NULL, \`to_date\` date NULL, \`to_start_time\` time NULL, \`changed_by_user_id\` int UNSIGNED NULL, \`reason\` varchar(255) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_appointment_history_appointment\` (\`appointment_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedules\` ADD CONSTRAINT \`FK_47d3ff6466132753b5d860da210\` FOREIGN KEY (\`professional_id\`) REFERENCES \`professionals\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedules\` ADD CONSTRAINT \`FK_0ad2f08dc0feb840cc9a217673a\` FOREIGN KEY (\`office_id\`) REFERENCES \`offices\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedule_exceptions\` ADD CONSTRAINT \`FK_b4636d2aacc42a6fbcdbf7b3f7a\` FOREIGN KEY (\`professional_id\`) REFERENCES \`professionals\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedule_exceptions\` ADD CONSTRAINT \`FK_6ff3bc35e72e9341b3d76da1c7b\` FOREIGN KEY (\`office_id\`) REFERENCES \`offices\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_3330f054416745deaa2cc130700\` FOREIGN KEY (\`patient_id\`) REFERENCES \`patients\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_60b7a60cf6727d87d525a750414\` FOREIGN KEY (\`professional_id\`) REFERENCES \`professionals\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_64c155c6bf30a0834032551adc5\` FOREIGN KEY (\`specialty_id\`) REFERENCES \`specialties\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` ADD CONSTRAINT \`FK_8b59868a1b27f663fe76af024fb\` FOREIGN KEY (\`office_id\`) REFERENCES \`offices\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointment_status_history\` ADD CONSTRAINT \`FK_2ad04802c05115ffe5c63c01052\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`appointment_status_history\` DROP FOREIGN KEY \`FK_2ad04802c05115ffe5c63c01052\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_8b59868a1b27f663fe76af024fb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_64c155c6bf30a0834032551adc5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_60b7a60cf6727d87d525a750414\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP FOREIGN KEY \`FK_3330f054416745deaa2cc130700\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedule_exceptions\` DROP FOREIGN KEY \`FK_6ff3bc35e72e9341b3d76da1c7b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedule_exceptions\` DROP FOREIGN KEY \`FK_b4636d2aacc42a6fbcdbf7b3f7a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedules\` DROP FOREIGN KEY \`FK_0ad2f08dc0feb840cc9a217673a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`schedules\` DROP FOREIGN KEY \`FK_47d3ff6466132753b5d860da210\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_appointment_history_appointment\` ON \`appointment_status_history\``,
    );
    await queryRunner.query(`DROP TABLE \`appointment_status_history\``);
    await queryRunner.query(
      `DELETE FROM \`turnero\`.\`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'active_slot', 'turnero', 'appointments'],
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_d838dde2371446d33c990332cb\` ON \`appointments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_appointments_active_slot\` ON \`appointments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_appointments_date_professional\` ON \`appointments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_appointments_patient\` ON \`appointments\``,
    );
    await queryRunner.query(`DROP TABLE \`appointments\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_85bcb7ae36549e3eb85686078d\` ON \`patients\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_patients_name\` ON \`patients\``);
    await queryRunner.query(`DROP TABLE \`patients\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_schedule_exceptions_range\` ON \`schedule_exceptions\``,
    );
    await queryRunner.query(`DROP TABLE \`schedule_exceptions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_schedules_professional_weekday\` ON \`schedules\``,
    );
    await queryRunner.query(`DROP TABLE \`schedules\``);
  }
}
