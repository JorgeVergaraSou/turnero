import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tope de turnos pendientes por DNI en la reserva pública (0 = sin tope).
 * Sin verificación de identidad, cualquiera que conozca un DNI puede
 * reservar con él: el tope acota cuántos horarios se pueden ocupar así.
 * El CHECK va a mano: TypeORM ignora @Check en MySQL.
 */
export class PublicBookingSafeguards1790610000000
  implements MigrationInterface
{
  name = 'PublicBookingSafeguards1790610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `clinic_settings` ADD `public_max_pending_per_patient` smallint UNSIGNED NOT NULL DEFAULT '2'",
    );
    await queryRunner.query(
      'ALTER TABLE clinic_settings ADD CONSTRAINT CHK_clinic_settings_max_pending CHECK (public_max_pending_per_patient BETWEEN 0 AND 20)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE clinic_settings DROP CHECK CHK_clinic_settings_max_pending',
    );
    await queryRunner.query(
      'ALTER TABLE `clinic_settings` DROP COLUMN `public_max_pending_per_patient`',
    );
  }
}
