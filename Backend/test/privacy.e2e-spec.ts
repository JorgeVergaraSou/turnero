/**
 * Aviso de privacidad y consentimiento en la reserva pública (Fase 1 de
 * cumplimiento legal). El backend es quien decide: sin la versión vigente
 * aceptada no hay reserva, y cada reserva deja una constancia que no se puede
 * modificar.
 */
import { INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  currentPrivacyVersion,
  prepareE2eDatabase,
  unique,
  uniqueDni,
} from './e2e-helpers';
import {
  ClinicFixture,
  createClinic,
  patientData,
  publicPatientData,
} from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';
import { computeNoticeHash } from '../src/privacy/privacy-notice.util';

describe('Aviso de privacidad y consentimiento (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinic: ClinicFixture;
  const tomorrow = addDays(clinicNow().date, 1);
  let slot = 0;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await app.close();
  });

  /** Horario libre distinto en cada llamada (el consultorio de este spec atiende de 06:00 a 22:00). */
  const nextSlot = () => {
    const minutes = 6 * 60 + 30 * slot++;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    return `${hh}:${minutes % 60 === 0 ? '00' : '30'}`;
  };

  const bookingBody = (overrides: Record<string, unknown> = {}) => ({
    professionalId: clinic.professionalId,
    specialtyId: clinic.specialtyId,
    date: tomorrow,
    startTime: nextSlot(),
    patient: publicPatientData(uniqueDni()),
    ...overrides,
  });

  // en la reserva web el email es obligatorio: los tests que no hablan del
  // email reciben uno por defecto (los de "sin email" usan `bookRaw`)
  const withEmail = (body: any) =>
    body?.patient && !body.patient.email
      ? { ...body, patient: { ...body.patient, email: 'paciente@example.com' } }
      : body;
  const bookRaw = (body: unknown) =>
    request(server)
      .post(`${API}/public/appointments`)
      .send(body as object);
  const book = (body: unknown) => bookRaw(withEmail(body));

  const publish = (body: Record<string, unknown>, token = admin.token) =>
    request(server)
      .post(`${API}/admin/privacy-notices`)
      .set(auth(token))
      .send(body);

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await dataSource.query(sql, params))[0].n);
  const appointments = () =>
    count('SELECT COUNT(*) AS n FROM appointments WHERE professional_id = ?', [
      clinic.professionalId,
    ]);
  const consents = () => count('SELECT COUNT(*) AS n FROM privacy_consents');
  const patientsWith = (dni: string) =>
    count('SELECT COUNT(*) AS n FROM patients WHERE document_number = ?', [
      dni,
    ]);

  describe('el aviso vigente', () => {
    it('es público, trae versión, aviso breve y política, y no se guarda en caché', async () => {
      const res = await request(server)
        .get(`${API}/public/privacy-notice`)
        .expect(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'draft',
        'policy',
        'publishedAt',
        'summary',
        'version',
      ]);
      expect(res.body.version).toBeGreaterThanOrEqual(1);
      // la base de pruebas conserva las versiones de corridas anteriores: solo se exige que haya texto
      expect(res.body.summary.length).toBeGreaterThan(0);
      expect(res.body.policy.length).toBeGreaterThan(0);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    it('la versión inicial es un borrador marcado como tal', async () => {
      const [first] = await dataSource.query(
        'SELECT summary, policy, is_draft FROM privacy_notices WHERE version = 1',
      );
      expect(first.is_draft).toBe(1);
      expect(first.summary).toMatch(/BORRADOR pendiente de revisión legal/);
      expect(first.policy).toMatch(/BORRADOR pendiente de revisión legal/);
    });
  });

  describe('la reserva exige aceptar la versión vigente', () => {
    it.each([
      ['sin el campo', undefined],
      ['null', null],
      ['0', 0],
      ['negativa', -1],
      ['decimal', 1.5],
      ['como texto', '1'],
      ['como array', [1]],
      ['como objeto', { v: 1 }],
      ['booleano', true],
    ])(
      'privacyVersion %s → 400 y no se crea turno ni paciente ni constancia',
      async (_c, value) => {
        const dni = uniqueDni();
        const before = { a: await appointments(), c: await consents() };
        const body = bookingBody({ patient: publicPatientData(dni) }) as Record<
          string,
          unknown
        >;
        if (value !== undefined) body.privacyVersion = value;
        const res = await book(body).expect(400);
        expect(JSON.stringify(res.body.message)).toMatch(
          /aviso de privacidad/i,
        );
        expect(await appointments()).toBe(before.a);
        expect(await consents()).toBe(before.c);
        expect(await patientsWith(dni)).toBe(0);
      },
    );

    it('con la versión vigente: 201 y queda la constancia (versión, huella y fecha)', async () => {
      const version = await currentPrivacyVersion(server);
      const dni = uniqueDni();
      const started = Date.now();
      const res = await book(
        bookingBody({
          patient: publicPatientData(dni),
          privacyVersion: version,
        }),
      ).expect(201);
      expect(res.body.code).toBeDefined();

      const [row] = await dataSource.query(
        `SELECT c.*, n.summary, n.policy, n.content_hash, a.code, p.document_number
           FROM privacy_consents c
           JOIN privacy_notices n ON n.version = c.notice_version
           JOIN appointments a ON a.id = c.appointment_id
           JOIN patients p ON p.id = c.patient_id
          WHERE a.code = ?`,
        [res.body.code],
      );
      expect(row.document_number).toBe(dni);
      expect(row.notice_version).toBe(version);
      expect(row.notice_hash).toBe(row.content_hash);
      expect(row.notice_hash).toBe(computeNoticeHash(row.summary, row.policy));
      expect(row.channel).toBe('PUBLICO');
      expect(row.recorded_by_user_id).toBeNull();
      expect(
        Math.abs(new Date(row.accepted_at).getTime() - started),
      ).toBeLessThan(60_000);
    });

    it('la constancia NO guarda la IP ni ningún dato de más', async () => {
      const columns = (
        await dataSource.query(
          `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'privacy_consents'`,
        )
      ).map((r: any) => r.c as string);
      expect(columns.sort()).toEqual([
        'accepted_at',
        'appointment_id',
        'channel',
        'id',
        'notice_hash',
        'notice_version',
        'patient_id',
        'recorded_by_user_id',
      ]);
    });

    it('con un DNI que ya existía, la constancia queda igual y el legajo no se pisa', async () => {
      const dni = uniqueDni();
      const created = await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(dni))
        .expect(201);
      const version = await currentPrivacyVersion(server);
      const res = await book(
        bookingBody({
          patient: {
            ...patientData(dni),
            firstName: 'Otro',
            phone: '11 4444-0000',
          },
          privacyVersion: version,
        }),
      ).expect(201);
      const [row] = await dataSource.query(
        `SELECT c.patient_id FROM privacy_consents c JOIN appointments a ON a.id = c.appointment_id WHERE a.code = ?`,
        [res.body.code],
      );
      expect(row.patient_id).toBe(created.body.id);
      const [patient] = await dataSource.query(
        'SELECT first_name FROM patients WHERE id = ?',
        [created.body.id],
      );
      expect(patient.first_name).toBe('Juan');
    });

    it('si el horario ya estaba ocupado (409) no queda ninguna constancia suelta', async () => {
      const version = await currentPrivacyVersion(server);
      const startTime = nextSlot();
      await book(bookingBody({ startTime, privacyVersion: version })).expect(
        201,
      );
      const before = { a: await appointments(), c: await consents() };
      const dni = uniqueDni();
      await book(
        bookingBody({
          startTime,
          patient: publicPatientData(dni),
          privacyVersion: version,
        }),
      ).expect(409);
      expect(await appointments()).toBe(before.a);
      expect(await consents()).toBe(before.c);
      expect(await patientsWith(dni)).toBe(0);
    });
  });

  describe('versiones: un cambio exige aceptar de nuevo', () => {
    const NEW = {
      summary: 'Aviso breve de prueba, versión nueva.',
      policy: 'Política de prueba, versión nueva.',
      isDraft: false,
    };

    it('publicar crea una versión nueva; con la vieja la reserva da 409 y con la nueva 201', async () => {
      const oldVersion = await currentPrivacyVersion(server);
      const published = await publish({
        ...NEW,
        summary: `${NEW.summary} ${unique()}`,
      }).expect(201);
      expect(published.body.version).toBe(oldVersion + 1);
      expect(await currentPrivacyVersion(server)).toBe(oldVersion + 1);

      const dniOld = uniqueDni();
      const before = { a: await appointments(), c: await consents() };
      const stale = await book(
        bookingBody({
          patient: publicPatientData(dniOld),
          privacyVersion: oldVersion,
        }),
      ).expect(409);
      expect(stale.body.message).toMatch(/aviso de privacidad cambió/i);
      expect(await appointments()).toBe(before.a);
      expect(await consents()).toBe(before.c);
      expect(await patientsWith(dniOld)).toBe(0);

      const res = await book(
        bookingBody({ privacyVersion: oldVersion + 1 }),
      ).expect(201);
      const [row] = await dataSource.query(
        `SELECT c.notice_version FROM privacy_consents c JOIN appointments a ON a.id = c.appointment_id WHERE a.code = ?`,
        [res.body.code],
      );
      expect(row.notice_version).toBe(oldVersion + 1);
    });

    it('las constancias anteriores conservan la versión que aceptó cada persona', async () => {
      const v = await currentPrivacyVersion(server);
      const first = await book(bookingBody({ privacyVersion: v })).expect(201);
      await publish({ ...NEW, summary: `${NEW.summary} ${unique()}` }).expect(
        201,
      );
      const [row] = await dataSource.query(
        `SELECT c.notice_version FROM privacy_consents c JOIN appointments a ON a.id = c.appointment_id WHERE a.code = ?`,
        [first.body.code],
      );
      expect(row.notice_version).toBe(v);
    });

    it('publicar exactamente lo mismo (sin cambios) da 409 y no crea una versión', async () => {
      const current = (
        await request(server).get(`${API}/public/privacy-notice`).expect(200)
      ).body;
      const versionBefore = current.version;
      const res = await publish({
        summary: current.summary,
        policy: current.policy,
        isDraft: current.draft,
      }).expect(409);
      expect(res.body.message).toMatch(/No hay cambios/);
      expect(await currentPrivacyVersion(server)).toBe(versionBefore);
    });

    it('cambiar solo la marca de borrador sí crea una versión nueva', async () => {
      const current = (
        await request(server).get(`${API}/public/privacy-notice`).expect(200)
      ).body;
      const res = await publish({
        summary: current.summary,
        policy: current.policy,
        isDraft: !current.draft,
      }).expect(201);
      expect(res.body.version).toBe(current.version + 1);
      expect(res.body.draft).toBe(!current.draft);
    });

    it('el administrador ve todas las versiones, la más nueva primero', async () => {
      const res = await request(server)
        .get(`${API}/admin/privacy-notices`)
        .set(auth(admin.token))
        .expect(200);
      const versions = res.body.map((n: any) => n.version);
      expect(versions).toEqual([...versions].sort((a, b) => b - a));
      expect(versions).toContain(1);
      expect(res.body[0]).toMatchObject({
        draft: expect.any(Boolean),
        summary: expect.any(String),
        policy: expect.any(String),
      });
    });
  });

  describe('administración del aviso', () => {
    it.each([
      ['aviso breve vacío', { summary: '' }],
      ['aviso breve solo espacios', { summary: '   ' }],
      ['aviso breve enorme', { summary: 'x'.repeat(2001) }],
      ['política vacía', { policy: '' }],
      ['política enorme', { policy: 'x'.repeat(30001) }],
      ['aviso breve como número', { summary: 123 }],
      ['política como array', { policy: ['a'] }],
      ['isDraft como texto', { isDraft: 'false' }],
      ['sin isDraft', { isDraft: undefined }],
      ['campo de más: version', { version: 99 }],
      ['campo de más: contentHash', { contentHash: 'a'.repeat(64) }],
      ['campo de más: createdByUserId', { createdByUserId: 1 }],
    ])('%s → 400 y no se publica nada', async (_c, override) => {
      const before = await currentPrivacyVersion(server);
      const body = {
        summary: `Texto ${unique()}`,
        policy: `Política ${unique()}`,
        isDraft: false,
        ...override,
      };
      await publish(body).expect(400);
      expect(await currentPrivacyVersion(server)).toBe(before);
    });

    it('RECEPCIONISTA y MEDICO reciben 403, y sin sesión 401', async () => {
      for (const token of [reception.token, clinic.doctor.token]) {
        await publish(
          { summary: 'a', policy: 'b', isDraft: false },
          token,
        ).expect(403);
        await request(server)
          .get(`${API}/admin/privacy-notices`)
          .set(auth(token))
          .expect(403);
      }
      await request(server)
        .post(`${API}/admin/privacy-notices`)
        .send({ summary: 'a', policy: 'b', isDraft: false })
        .expect(401);
      await request(server).get(`${API}/admin/privacy-notices`).expect(401);
    });

    it('publicar queda auditado, sin el texto', async () => {
      const res = await publish({
        summary: `Aviso ${unique()}`,
        policy: `Política ${unique()}`,
        isDraft: false,
      }).expect(201);
      const [log] = await dataSource.query(
        `SELECT actor_user_id, metadata FROM audit_logs
          WHERE action = 'PRIVACY_NOTICE_PUBLISH' AND resource_id = ?`,
        [String(res.body.version)],
      );
      expect(log.actor_user_id).toBe(admin.userId);
      expect(JSON.stringify(log.metadata)).toBe('{"isDraft":false}');
    });
  });

  describe('integridad: solo se agregan', () => {
    it.each([
      ['privacy_notices', "UPDATE privacy_notices SET summary = 'x'"],
      ['privacy_notices', 'DELETE FROM privacy_notices'],
      ['privacy_consents', 'UPDATE privacy_consents SET notice_version = 1'],
      ['privacy_consents', 'DELETE FROM privacy_consents'],
    ])('%s: "%s" es rechazado por la base', async (_t, sql) => {
      await expect(dataSource.query(sql)).rejects.toThrow(/append-only/);
    });

    it('no se puede dar de alta una constancia duplicada para el mismo turno', async () => {
      const version = await currentPrivacyVersion(server);
      const res = await book(bookingBody({ privacyVersion: version })).expect(
        201,
      );
      const [a] = await dataSource.query(
        'SELECT id, patient_id FROM appointments WHERE code = ?',
        [res.body.code],
      );
      await expect(
        dataSource.query(
          `INSERT INTO privacy_consents (appointment_id, patient_id, notice_version, notice_hash, channel, accepted_at)
           VALUES (?, ?, ?, ?, 'PUBLICO', NOW(3))`,
          [a.id, a.patient_id, version, 'a'.repeat(64)],
        ),
      ).rejects.toThrow(/Duplicate/i);
    });
  });
});
