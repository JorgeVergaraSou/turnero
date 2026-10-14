import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avisos por WhatsApp hechos A MANO por recepción (enlace wa.me, no se manda
 * nada solo). Cada etapa (1.ª y 2.ª) se marca una sola vez por turno:
 * `whatsappN_sent_at` es cuándo recepción lo dio por avisado (o lo descartó).
 * Reprogramar el turno los vuelve a null.
 */
export class WhatsappReminders1790770000000 implements MigrationInterface {
  name = 'WhatsappReminders1790770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` ADD `whatsapp1_sent_at` datetime NULL, ADD `whatsapp2_sent_at` datetime NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` DROP COLUMN `whatsapp2_sent_at`, DROP COLUMN `whatsapp1_sent_at`',
    );
  }
}
