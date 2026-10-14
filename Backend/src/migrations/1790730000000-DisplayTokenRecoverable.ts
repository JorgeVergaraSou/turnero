import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite que el administrador vuelva a ver el token/enlace de una pantalla
 * (antes solo se mostraba al crearlo). Se guarda cifrado (AES-256-GCM, clave
 * del servidor) además del hash con el que se autentica la pantalla. Las
 * pantallas ya creadas quedan en NULL: no se puede recuperar lo que nunca se
 * guardó, hay que cambiarles el token una vez.
 */
export class DisplayTokenRecoverable1790730000000
  implements MigrationInterface
{
  name = 'DisplayTokenRecoverable1790730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `display_devices` ADD `token_encrypted` varchar(255) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `display_devices` DROP COLUMN `token_encrypted`',
    );
  }
}
