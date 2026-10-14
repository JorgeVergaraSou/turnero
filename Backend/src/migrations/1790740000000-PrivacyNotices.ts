import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aviso de privacidad y consentimiento de la reserva pública.
 *
 * - privacy_notices: cada versión del aviso breve + la política completa.
 *   Solo se agregan versiones (triggers a mano, como audit_logs): así se puede
 *   probar qué texto exacto aceptó cada persona.
 * - privacy_consents: una fila por turno (UNIQUE appointment_id) con la
 *   versión aceptada, la huella SHA-256 del texto y la fecha y hora. También
 *   append-only. NO guarda la IP (minimización de datos).
 *
 * La versión 1 es un BORRADOR pendiente de revisión legal (is_draft = 1): lo
 * reemplaza el administrador, desde Configuración, con el texto que apruebe
 * el abogado. Los turnos anteriores a esta migración quedan "sin registro":
 * no se inventan consentimientos retroactivos.
 */
const SUMMARY =
  'BORRADOR pendiente de revisión legal. ' +
  'Usamos tus datos personales (nombre, apellido, DNI, teléfono, fecha de nacimiento, obra social y, si lo cargás, tu email) únicamente para gestionar tu turno y comunicarnos con vos sobre él. ' +
  'El consultorio los conserva en una base de datos protegida, a la que solo accede el personal autorizado. ' +
  'Podés pedir acceso, rectificación o supresión de tus datos comunicándote con el consultorio. ' +
  'Más información en la política de privacidad.';

const POLICY = [
  'BORRADOR pendiente de revisión legal. Este texto es un modelo inicial: no debe usarse como texto definitivo hasta que lo revise un abogado.',
  '1. Responsable de los datos\nEl responsable del tratamiento es el consultorio que te da el turno. [COMPLETAR: razón social o nombre del profesional, domicilio y email de contacto.]',
  '2. Qué datos pedimos al reservar\nNombre, apellido, DNI, teléfono, fecha de nacimiento (opcional), obra social y número de afiliado (opcionales) y email (opcional). Al reservar no pedimos información clínica.',
  '3. Para qué los usamos\nPara gestionar tu turno (reservarlo, confirmarlo, reprogramarlo o cancelarlo), identificarte al llegar y comunicarnos con vos. Si dejás tu email, te enviamos el comprobante del turno y recordatorios.',
  '4. Datos de salud\nLa información clínica se registra durante la atención, por el profesional que te atiende, y está protegida por el secreto profesional y por las normas de derechos del paciente. No se carga en la reserva.',
  '5. Con quién se comparten\nNo se ceden a terceros, salvo obligación legal. [COMPLETAR: proveedores que intervienen, por ejemplo el servicio de alojamiento y el de correo electrónico.]',
  '6. Cuánto tiempo se conservan\nLos datos del turno se conservan mientras sean necesarios para la gestión del consultorio. La historia clínica se conserva durante los plazos que fija la ley. [COMPLETAR Y VALIDAR LOS PLAZOS.]',
  '7. Seguridad\nLos datos se guardan en una base protegida, con acceso por usuario y permisos, y cada acceso a información clínica queda registrado.',
  '8. Tus derechos\nPodés pedir acceso, rectificación, actualización o supresión de tus datos comunicándote con el consultorio. El acceso es gratuito a intervalos no inferiores a seis meses, salvo que acredites un interés legítimo (art. 14, inc. 3, Ley 25.326). La Agencia de Acceso a la Información Pública (AAIP), órgano de control de la Ley 25.326, atiende las denuncias y reclamos de quienes se vean afectados en sus derechos. [VALIDAR LEYENDA CON EL ABOGADO.]',
].join('\n\n');

/** Misma fórmula que src/privacy/privacy-notice.util.ts (la migración es autónoma). */
const hash = (summary: string, policy: string) =>
  createHash('sha256')
    .update(JSON.stringify({ summary, policy }))
    .digest('hex');

export class PrivacyNotices1790740000000 implements MigrationInterface {
  name = 'PrivacyNotices1790740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`privacy_notices\` (
        \`version\` int UNSIGNED NOT NULL AUTO_INCREMENT,
        \`summary\` text NOT NULL,
        \`policy\` text NOT NULL,
        \`is_draft\` tinyint NOT NULL DEFAULT 0,
        \`content_hash\` char(64) NOT NULL,
        \`created_by_user_id\` int UNSIGNED NULL,
        \`created_at\` datetime(3) NOT NULL,
        PRIMARY KEY (\`version\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      'ALTER TABLE `privacy_notices` ADD CONSTRAINT `FK_privacy_notices_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'INSERT INTO `privacy_notices` (`summary`, `policy`, `is_draft`, `content_hash`, `created_at`) VALUES (?, ?, 1, ?, NOW(3))',
      [SUMMARY, POLICY, hash(SUMMARY, POLICY)],
    );

    await queryRunner.query(
      `CREATE TABLE \`privacy_consents\` (
        \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
        \`appointment_id\` int UNSIGNED NOT NULL,
        \`patient_id\` int UNSIGNED NOT NULL,
        \`notice_version\` int UNSIGNED NOT NULL,
        \`notice_hash\` char(64) NOT NULL,
        \`channel\` enum ('PUBLICO', 'RECEPCION') NOT NULL,
        \`recorded_by_user_id\` int UNSIGNED NULL,
        \`accepted_at\` datetime(3) NOT NULL,
        UNIQUE INDEX \`UQ_privacy_consents_appointment\` (\`appointment_id\`),
        INDEX \`IDX_privacy_consents_patient\` (\`patient_id\`, \`accepted_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      'ALTER TABLE `privacy_consents` ADD CONSTRAINT `FK_privacy_consents_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `privacy_consents` ADD CONSTRAINT `FK_privacy_consents_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `privacy_consents` ADD CONSTRAINT `FK_privacy_consents_notice` FOREIGN KEY (`notice_version`) REFERENCES `privacy_notices`(`version`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `privacy_consents` ADD CONSTRAINT `FK_privacy_consents_user` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );

    for (const table of ['privacy_notices', 'privacy_consents']) {
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
    for (const table of ['privacy_notices', 'privacy_consents']) {
      for (const event of ['update', 'delete']) {
        await queryRunner.query(
          `DROP TRIGGER IF EXISTS trg_${table}_no_${event}`,
        );
      }
    }
    await queryRunner.query('DROP TABLE `privacy_consents`');
    await queryRunner.query('DROP TABLE `privacy_notices`');
  }
}
