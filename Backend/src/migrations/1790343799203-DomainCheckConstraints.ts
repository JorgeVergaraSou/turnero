import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CHECK constraints de dominio, escritas a mano: TypeORM ignora @Check en
 * MySQL (y migration:generate nunca las detecta), así que viven solo acá.
 * MySQL >= 8.0.16 las hace cumplir. Son la última red de seguridad — los
 * services validan lo mismo antes, con mensajes claros.
 */
export class DomainCheckConstraints1790343799203 implements MigrationInterface {
  name = 'DomainCheckConstraints1790343799203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `schedules` ' +
        'ADD CONSTRAINT `CHK_schedules_time_range` CHECK (`start_time` < `end_time`), ' +
        'ADD CONSTRAINT `CHK_schedules_weekday` CHECK (`weekday` BETWEEN 1 AND 7), ' +
        'ADD CONSTRAINT `CHK_schedules_slot_minutes` CHECK (`slot_minutes` IN (15, 20, 30, 45, 60)), ' +
        'ADD CONSTRAINT `CHK_schedules_validity` CHECK (`valid_until` IS NULL OR `valid_until` >= `valid_from`)',
    );
    await queryRunner.query(
      'ALTER TABLE `schedule_exceptions` ' +
        'ADD CONSTRAINT `CHK_schedule_exceptions_date_range` CHECK (`start_date` <= `end_date`), ' +
        'ADD CONSTRAINT `CHK_schedule_exceptions_time_range` CHECK (' +
        '(`start_time` IS NULL AND `end_time` IS NULL) OR ' +
        '(`start_time` IS NOT NULL AND `end_time` IS NOT NULL AND `start_time` < `end_time`))',
    );
    await queryRunner.query(
      'ALTER TABLE `appointments` ' +
        'ADD CONSTRAINT `CHK_appointments_time_range` CHECK (`start_time` < `end_time`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `appointments` DROP CHECK `CHK_appointments_time_range`',
    );
    await queryRunner.query(
      'ALTER TABLE `schedule_exceptions` ' +
        'DROP CHECK `CHK_schedule_exceptions_time_range`, ' +
        'DROP CHECK `CHK_schedule_exceptions_date_range`',
    );
    await queryRunner.query(
      'ALTER TABLE `schedules` ' +
        'DROP CHECK `CHK_schedules_validity`, ' +
        'DROP CHECK `CHK_schedules_slot_minutes`, ' +
        'DROP CHECK `CHK_schedules_weekday`, ' +
        'DROP CHECK `CHK_schedules_time_range`',
    );
  }
}
