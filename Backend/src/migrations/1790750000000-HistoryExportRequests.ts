import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos de copia de la historia clínica (art. 14, Ley 26.529: el paciente
 * puede pedirla y se le entrega dentro de las 48 horas).
 *
 * La tabla guarda SOLO el trámite (quién pidió, quién la emite, plazos,
 * huellas SHA-256 de lo emitido): nada clínico. El PDF no se guarda en
 * ningún lado: se genera en el momento y se entrega. Un pedido no se borra
 * (trigger): se cancela o se entrega.
 */
export class HistoryExportRequests1790750000000 implements MigrationInterface {
  name = 'HistoryExportRequests1790750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`history_export_requests\` (
        \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
        \`patient_id\` int UNSIGNED NOT NULL,
        \`requester_type\` enum('TITULAR','REPRESENTANTE') NOT NULL,
        \`requester_name\` varchar(120) NULL,
        \`requester_document\` varchar(20) NULL,
        \`requester_relationship\` varchar(60) NULL,
        \`identity_checked\` tinyint NOT NULL,
        \`requested_by_user_id\` int UNSIGNED NOT NULL,
        \`assigned_professional_id\` int UNSIGNED NOT NULL,
        \`status\` enum('PENDIENTE','EMITIDA','ENTREGADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
        \`requested_at\` datetime(3) NOT NULL,
        \`due_at\` datetime(3) NOT NULL,
        \`issued_at\` datetime(3) NULL,
        \`issued_by_user_id\` int UNSIGNED NULL,
        \`issue_count\` int UNSIGNED NOT NULL DEFAULT 0,
        \`consultations_count\` int UNSIGNED NULL,
        \`chain_hash\` char(64) NULL,
        \`pdf_hash\` char(64) NULL,
        \`delivered_at\` datetime(3) NULL,
        \`delivered_by_user_id\` int UNSIGNED NULL,
        \`cancelled_at\` datetime(3) NULL,
        \`cancelled_by_user_id\` int UNSIGNED NULL,
        \`cancel_reason\` varchar(255) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_history_exports_status_due\` (\`status\`, \`due_at\`),
        INDEX \`IDX_history_exports_professional\` (\`assigned_professional_id\`, \`status\`),
        INDEX \`IDX_history_exports_patient\` (\`patient_id\`, \`status\`)
      ) ENGINE=InnoDB`,
    );
    const fk = (name: string, column: string, table: string, ref: string) =>
      queryRunner.query(
        `ALTER TABLE \`history_export_requests\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${table}\`(\`${ref}\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    await fk('FK_history_exports_patient', 'patient_id', 'patients', 'id');
    await fk(
      'FK_history_exports_professional',
      'assigned_professional_id',
      'professionals',
      'id',
    );
    await fk(
      'FK_history_exports_requested_by',
      'requested_by_user_id',
      'users',
      'id_user',
    );
    await fk(
      'FK_history_exports_issued_by',
      'issued_by_user_id',
      'users',
      'id_user',
    );
    await fk(
      'FK_history_exports_delivered_by',
      'delivered_by_user_id',
      'users',
      'id_user',
    );
    await fk(
      'FK_history_exports_cancelled_by',
      'cancelled_by_user_id',
      'users',
      'id_user',
    );

    // CHECKs a mano (TypeORM no los modela): el plazo y la coherencia del estado
    await queryRunner.query(
      'ALTER TABLE `history_export_requests` ADD CONSTRAINT `CHK_history_exports_due` CHECK (`due_at` > `requested_at`)',
    );
    await queryRunner.query(
      "ALTER TABLE `history_export_requests` ADD CONSTRAINT `CHK_history_exports_representative` CHECK (`requester_type` = 'TITULAR' OR (`requester_name` IS NOT NULL AND `requester_document` IS NOT NULL AND `requester_relationship` IS NOT NULL))",
    );
    await queryRunner.query(
      "ALTER TABLE `history_export_requests` ADD CONSTRAINT `CHK_history_exports_state` CHECK ((`status` NOT IN ('EMITIDA','ENTREGADA')) OR (`issued_at` IS NOT NULL AND `pdf_hash` IS NOT NULL AND `chain_hash` IS NOT NULL))",
    );

    // nada se borra: un pedido se cancela o se entrega
    await queryRunner.query(`
      CREATE TRIGGER trg_history_export_requests_no_delete
      BEFORE DELETE ON history_export_requests FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Los pedidos de copia de historia clínica no se eliminan';
      END`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_history_export_requests_no_delete',
    );
    await queryRunner.query('DROP TABLE `history_export_requests`');
  }
}
