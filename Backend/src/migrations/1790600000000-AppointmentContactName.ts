import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nombre de contacto ingresado AL RESERVAR (como contact_phone/email).
 * La reserva pública reutiliza el legajo si el DNI ya existe; si las
 * respuestas públicas y los emails mostraran el nombre del legajo,
 * cualquiera podría averiguar a quién pertenece un DNI reservando con él.
 * Los turnos existentes toman el nombre del legajo.
 */
export class AppointmentContactName1790600000000 implements MigrationInterface {
  name = 'AppointmentContactName1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` ADD `contact_first_name` varchar(80) NULL, ADD `contact_last_name` varchar(80) NULL',
    );
    await queryRunner.query(
      'UPDATE `appointments` a JOIN `patients` p ON p.id = a.patient_id SET a.contact_first_name = p.first_name, a.contact_last_name = p.last_name',
    );
    await queryRunner.query(
      'ALTER TABLE `appointments` MODIFY `contact_first_name` varchar(80) NOT NULL, MODIFY `contact_last_name` varchar(80) NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` DROP COLUMN `contact_last_name`, DROP COLUMN `contact_first_name`',
    );
  }
}
