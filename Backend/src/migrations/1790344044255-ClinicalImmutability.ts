import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inmutabilidad a nivel base de datos (defensa en profundidad: los
 * services ya validan lo mismo). Ni un bug futuro ni una query mal hecha
 * pueden, sin error:
 * - modificar una consulta FINALIZADA, ni agregar/modificar/borrar sus
 *   diagnósticos, medicación o estudios;
 * - borrar consultas (ni siquiera en borrador: son registro clínico);
 * - modificar/borrar enmiendas, historial de turnos o auditoría
 *   (append-only).
 * Un intento dispara SIGNAL SQLSTATE '45000' → QueryFailedError → 500
 * genérico (el detalle queda en el log).
 */
const CHILD_TABLES = [
  'consultation_diagnoses',
  'consultation_medications',
  'consultation_study_requests',
];
const APPEND_ONLY_TABLES = [
  'consultation_amendments',
  'appointment_status_history',
  'audit_logs',
];
const CHILD_EVENTS: Array<[string, 'NEW' | 'OLD']> = [
  ['INSERT', 'NEW'],
  ['UPDATE', 'OLD'],
  ['DELETE', 'OLD'],
];

function triggerNames(): string[] {
  return [
    'trg_consultations_no_update_finalized',
    'trg_consultations_no_delete',
    ...CHILD_TABLES.flatMap((table) =>
      CHILD_EVENTS.map(([event]) => `trg_${table}_${event.toLowerCase()}_fin`),
    ),
    ...APPEND_ONLY_TABLES.flatMap((table) =>
      ['update', 'delete'].map((event) => `trg_${table}_no_${event}`),
    ),
  ];
}

export class ClinicalImmutability1790344044255 implements MigrationInterface {
  name = 'ClinicalImmutability1790344044255';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER trg_consultations_no_update_finalized
      BEFORE UPDATE ON medical_consultations FOR EACH ROW
      BEGIN
        IF OLD.status = 'FINALIZADA' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Consulta finalizada: no se puede modificar (usar enmienda)';
        END IF;
      END`);

    await queryRunner.query(`
      CREATE TRIGGER trg_consultations_no_delete
      BEFORE DELETE ON medical_consultations FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Las consultas medicas no se eliminan';
      END`);

    for (const table of CHILD_TABLES) {
      for (const [event, row] of CHILD_EVENTS) {
        await queryRunner.query(`
          CREATE TRIGGER trg_${table}_${event.toLowerCase()}_fin
          BEFORE ${event} ON ${table} FOR EACH ROW
          BEGIN
            IF (SELECT status FROM medical_consultations
                WHERE id = ${row}.consultation_id) = 'FINALIZADA' THEN
              SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Consulta finalizada: sus items no se pueden modificar';
            END IF;
          END`);
      }
    }

    for (const table of APPEND_ONLY_TABLES) {
      for (const event of ['UPDATE', 'DELETE']) {
        await queryRunner.query(`
          CREATE TRIGGER trg_${table}_no_${event.toLowerCase()}
          BEFORE ${event} ON ${table} FOR EACH ROW
          BEGIN
            SIGNAL SQLSTATE '45000'
              SET MESSAGE_TEXT = 'Registro append-only: no se puede modificar ni eliminar';
          END`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of triggerNames()) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS ${name}`);
    }
  }
}
