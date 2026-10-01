import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Llamado de pacientes a la sala de espera: un registro por cada vez que el
 * médico llama (o vuelve a llamar) a un turno. NO hay estado nuevo en el
 * turno: un paciente puede ser llamado varias veces.
 *
 * - UNIQUE (appointment_id, call_number): dos llamados simultáneos no pueden
 *   tomar el mismo número de repetición (respaldo del bloqueo del turno).
 * - Append-only (triggers a mano, como audit_logs): un llamado hecho no se
 *   edita ni se borra.
 */
export class AppointmentCalls1790700000000 implements MigrationInterface {
  name = 'AppointmentCalls1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`appointment_calls\` (
        \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
        \`appointment_id\` int UNSIGNED NOT NULL,
        \`office_id\` int UNSIGNED NOT NULL,
        \`called_by_user_id\` int UNSIGNED NOT NULL,
        \`call_number\` smallint UNSIGNED NOT NULL,
        \`called_at\` datetime(3) NOT NULL,
        UNIQUE INDEX \`UQ_appointment_calls_number\` (\`appointment_id\`, \`call_number\`),
        INDEX \`IDX_appointment_calls_called_at\` (\`called_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      'ALTER TABLE `appointment_calls` ADD CONSTRAINT `FK_appointment_calls_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `appointment_calls` ADD CONSTRAINT `FK_appointment_calls_office` FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `appointment_calls` ADD CONSTRAINT `FK_appointment_calls_user` FOREIGN KEY (`called_by_user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `appointment_calls` ADD CONSTRAINT `CHK_appointment_calls_number` CHECK (`call_number` >= 1)',
    );

    for (const event of ['UPDATE', 'DELETE']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_appointment_calls_no_${event.toLowerCase()}
        BEFORE ${event} ON appointment_calls FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Registro append-only: no se puede modificar ni eliminar';
        END`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const event of ['update', 'delete']) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_appointment_calls_no_${event}`,
      );
    }
    await queryRunner.query('DROP TABLE `appointment_calls`');
  }
}
