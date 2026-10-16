/**
 * QA: concurrencia. Cada caso dispara varias peticiones EN PARALELO contra la
 * API real y comprueba invariantes del negocio (un solo ganador, nada de 5xx,
 * integridad de lo que quedó en la base). No asume el orden de llegada.
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
import { ClinicFixture, createClinic, patientData } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';
import { AppointmentEntity } from '../src/appointments/entities/appointment.entity';
import {
  AppointmentSource,
  AppointmentStatus,
} from '../src/appointments/appointment-status';
import { generateAppointmentCode } from '../src/appointments/appointment-code.util';
import { checkContentHashes } from '../src/backup/restore-checks';

const statuses = (results: request.Response[]) =>
  results.map((r) => r.status).sort((a, b) => a - b);
const count = (results: request.Response[], status: number) =>
  results.filter((r) => r.status === status).length;
const noServerErrors = (results: request.Response[]) =>
  expect(results.filter((r) => r.status >= 500).map((r) => r.status)).toEqual(
    [],
  );

describe('QA: concurrencia (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinics: ClinicFixture[];
  let privacyVersion: number;
  let slot = 0;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinics = [];
    for (let i = 0; i < 4; i++)
      clinics.push(await createClinic(app, admin.token));
    privacyVersion = await currentPrivacyVersion(server);
  }, 180000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await app.close();
  });

  /** Horario libre distinto en cada llamada (06:00 a 21:30, de a 30 min). */
  const nextTime = () => {
    const minutes = 6 * 60 + 30 * (slot++ % 32);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`;
  };
  // los horarios se reparten en días distintos para no agotarlos
  let dayOffset = 1;
  const nextDay = () => addDays(clinicNow().date, ++dayOffset);

  const publicBody = (
    clinic: ClinicFixture,
    date: string,
    startTime: string,
    dni = uniqueDni(),
  ) => ({
    professionalId: clinic.professionalId,
    specialtyId: clinic.specialtyId,
    date,
    startTime,
    patient: patientData(dni),
    privacyVersion,
  });
  const bookPublic = (body: object) =>
    request(server).post(`${API}/public/appointments`).send(body);
  const bookByReception = (
    clinic: ClinicFixture,
    patientId: number,
    date: string,
    startTime: string,
  ) =>
    request(server)
      .post(`${API}/admin/appointments`)
      .set(auth(reception.token))
      .send({
        professionalId: clinic.professionalId,
        specialtyId: clinic.specialtyId,
        patientId,
        date,
        startTime,
      });
  const newPatient = async () =>
    (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body as { id: number };
  const q = (sql: string, params: unknown[] = []) =>
    dataSource.query(sql, params);

  describe('reservas', () => {
    it('A1. 20 reservas públicas simultáneas del MISMO horario: gana una sola', async () => {
      const date = nextDay();
      const time = nextTime();
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          bookPublic(publicBody(clinics[0], date, time)),
        ),
      );
      noServerErrors(results);
      expect(count(results, 201)).toBe(1);
      // el resto: 409 (horario ocupado) o 429 (límite de reservas por IP, a propósito)
      expect(count(results, 409) + count(results, 429)).toBe(19);
      const [{ n }] = await q(
        "SELECT COUNT(*) n FROM appointments WHERE professional_id=? AND date=? AND start_time=? AND status<>'CANCELADO'",
        [clinics[0].professionalId, date, `${time}:00`],
      );
      expect(Number(n)).toBe(1);
    });

    it('A2. recepción y web compitiendo por el mismo horario: gana uno', async () => {
      const date = nextDay();
      const time = nextTime();
      const patients = await Promise.all([
        newPatient(),
        newPatient(),
        newPatient(),
      ]);
      const results = await Promise.all([
        ...patients.map((p) => bookByReception(clinics[1], p.id, date, time)),
        ...Array.from({ length: 5 }, () =>
          bookPublic(publicBody(clinics[1], date, time)),
        ),
      ]);
      noServerErrors(results);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    });

    it('A3. el MISMO paciente pidiendo a la vez el mismo horario con DOS médicos distintos: solo una reserva', async () => {
      const date = nextDay();
      const time = nextTime();
      const dni = uniqueDni();
      const results = await Promise.all([
        bookPublic(publicBody(clinics[0], date, time, dni)),
        bookPublic(publicBody(clinics[1], date, time, dni)),
        bookPublic(publicBody(clinics[2], date, time, dni)),
        bookPublic(publicBody(clinics[3], date, time, dni)),
      ]);
      noServerErrors(results);
      const [{ n }] = await q(
        `SELECT COUNT(*) n FROM appointments a JOIN patients p ON p.id=a.patient_id
          WHERE p.document_number=? AND a.date=? AND a.start_time=? AND a.status<>'CANCELADO'`,
        [dni, date, `${time}:00`],
      );
      // INVARIANTE: una persona no puede estar en dos consultorios a la misma hora
      expect({ reservas: Number(n), respuestas: statuses(results) }).toEqual({
        reservas: 1,
        respuestas: expect.anything(),
      });
    });

    it('A4. el límite de turnos pendientes por DNI (2) no se supera con reservas simultáneas', async () => {
      const dni = uniqueDni();
      const results = await Promise.all(
        [0, 1, 2, 3].flatMap((i) =>
          [0, 1].map(() =>
            bookPublic(publicBody(clinics[i], nextDay(), nextTime(), dni)),
          ),
        ),
      );
      noServerErrors(results);
      const [{ n }] = await q(
        `SELECT COUNT(*) n FROM appointments a JOIN patients p ON p.id=a.patient_id
          WHERE p.document_number=? AND a.status IN ('RESERVADO','CONFIRMADO')`,
        [dni],
      );
      const limit = (
        await request(server)
          .get(`${API}/admin/settings`)
          .set(auth(admin.token))
      ).body.publicMaxPendingPerPatient;
      expect({ pendientes: Number(n), limite: limit }).toEqual({
        pendientes: expect.any(Number),
        limite: limit,
      });
      expect(Number(n)).toBeLessThanOrEqual(limit);
    });

    it('A5. varias reservas simultáneas del mismo DNI nuevo: un solo paciente y sin errores de servidor', async () => {
      const dni = uniqueDni();
      const date = nextDay();
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          bookPublic(publicBody(clinics[0], date, nextTime(), dni)),
        ),
      );
      noServerErrors(results);
      const [{ n }] = await q(
        'SELECT COUNT(*) n FROM patients WHERE document_number=?',
        [dni],
      );
      expect(Number(n)).toBe(1);
    });

    it('A6. confirmar 10 veces a la vez: una transición, sin 5xx y con historial coherente', async () => {
      const patient = await newPatient();
      const created = await bookByReception(
        clinics[2],
        patient.id,
        nextDay(),
        nextTime(),
      ).expect(201);
      const id = created.body.id;
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(server)
            .post(`${API}/admin/appointments/${id}/confirm`)
            .set(auth(reception.token)),
        ),
      );
      noServerErrors(results);
      expect(count(results, 200)).toBe(1);
      const [{ n }] = await q(
        "SELECT COUNT(*) n FROM appointment_status_history WHERE appointment_id=? AND to_status='CONFIRMADO'",
        [id],
      );
      expect(Number(n)).toBe(1);
    });

    it('A7. confirmar y cancelar a la vez: queda un estado válido y el historial lo explica', async () => {
      const patient = await newPatient();
      const id = (
        await bookByReception(
          clinics[2],
          patient.id,
          nextDay(),
          nextTime(),
        ).expect(201)
      ).body.id;
      const results = await Promise.all([
        request(server)
          .post(`${API}/admin/appointments/${id}/confirm`)
          .set(auth(reception.token)),
        request(server)
          .post(`${API}/admin/appointments/${id}/cancel`)
          .set(auth(reception.token))
          .send({ reason: 'carrera' }),
        request(server)
          .post(`${API}/admin/appointments/${id}/confirm`)
          .set(auth(reception.token)),
      ]);
      noServerErrors(results);
      const [row] = await q('SELECT status FROM appointments WHERE id=?', [id]);
      const history = await q(
        'SELECT from_status f, to_status t FROM appointment_status_history WHERE appointment_id=? ORDER BY id',
        [id],
      );
      // el último estado del historial es el que quedó en el turno
      expect(history[history.length - 1].t).toBe(row.status);
      // y cada fila encadena con la anterior (sin saltos imposibles)
      for (let i = 1; i < history.length; i++) {
        expect(history[i].f).toBe(history[i - 1].t);
      }
    });

    it('A8. dos turnos reprogramados al mismo horario a la vez: gana uno', async () => {
      const [p1, p2] = await Promise.all([newPatient(), newPatient()]);
      const [a, b] = await Promise.all([
        bookByReception(clinics[3], p1.id, nextDay(), nextTime()),
        bookByReception(clinics[3], p2.id, nextDay(), nextTime()),
      ]);
      const target = nextDay();
      const time = nextTime();
      const results = await Promise.all(
        [a.body.id, b.body.id].map((id) =>
          request(server)
            .patch(`${API}/admin/appointments/${id}/reschedule`)
            .set(auth(reception.token))
            .send({ date: target, startTime: time }),
        ),
      );
      noServerErrors(results);
      expect(count(results, 200)).toBe(1);
      expect(count(results, 409)).toBe(1);
    });
  });

  describe('atención clínica', () => {
    let nextMinute = 0;
    const todayAppointment = async (
      clinic: ClinicFixture,
      patientId: number,
    ) => {
      nextMinute += 1;
      const mm = String(nextMinute % 60).padStart(2, '0');
      const ss = String(Math.floor(nextMinute / 60) % 60).padStart(2, '0');
      const inserted = await dataSource
        .getRepository(AppointmentEntity)
        .insert({
          code: generateAppointmentCode(),
          patientId,
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          officeId: clinic.officeId,
          date: clinicNow().date,
          startTime: `00:${mm}:${ss}`,
          endTime: `00:${mm}:${String((Number(ss) + 1) % 60).padStart(2, '0')}`,
          status: AppointmentStatus.CONFIRMADO,
          source: AppointmentSource.RECEPCION,
          contactFirstName: 'Paciente',
          contactLastName: 'Prueba',
          contactPhone: '1155550000',
        });
      return inserted.identifiers[0].id as number;
    };
    const start = (clinic: ClinicFixture, appointmentId: number) =>
      request(server)
        .post(`${API}/doctor/appointments/${appointmentId}/start`)
        .set(auth(clinic.doctor.token));

    it('B1. iniciar la atención 6 veces a la vez: una sola consulta', async () => {
      const patient = await newPatient();
      const appointmentId = await todayAppointment(clinics[0], patient.id);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => start(clinics[0], appointmentId)),
      );
      noServerErrors(results);
      const [{ n }] = await q(
        'SELECT COUNT(*) n FROM medical_consultations WHERE appointment_id=?',
        [appointmentId],
      );
      expect(Number(n)).toBe(1);
      const ids = new Set(
        results.filter((r) => r.status === 200).map((r) => r.body.id),
      );
      expect(ids.size).toBe(1);
    });

    it('B2. finalizar 6 veces a la vez: una sola finalización, turno atendido una vez', async () => {
      const patient = await newPatient();
      const appointmentId = await todayAppointment(clinics[0], patient.id);
      const id = (await start(clinics[0], appointmentId).expect(200)).body.id;
      await request(server)
        .patch(`${API}/doctor/consultations/${id}`)
        .set(auth(clinics[0].doctor.token))
        .send({ reason: 'Control' })
        .expect(200);
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(server)
            .post(`${API}/doctor/consultations/${id}/finalize`)
            .set(auth(clinics[0].doctor.token)),
        ),
      );
      noServerErrors(results);
      expect(count(results, 200)).toBe(1);
      const [{ n }] = await q(
        "SELECT COUNT(*) n FROM appointment_status_history WHERE appointment_id=? AND to_status='ATENDIDO'",
        [appointmentId],
      );
      expect(Number(n)).toBe(1);
      const [{ a }] = await q(
        "SELECT COUNT(*) a FROM audit_logs WHERE action='FINALIZE_MEDICAL_CONSULTATION' AND resource_id=?",
        [String(id)],
      );
      expect(Number(a)).toBe(1);
    });

    it('B3. 6 enmiendas simultáneas: se guardan las 6, sin perder ninguna', async () => {
      const patient = await newPatient();
      const appointmentId = await todayAppointment(clinics[1], patient.id);
      const id = (await start(clinics[1], appointmentId).expect(200)).body.id;
      await request(server)
        .patch(`${API}/doctor/consultations/${id}`)
        .set(auth(clinics[1].doctor.token))
        .send({ reason: 'Control' })
        .expect(200);
      await request(server)
        .post(`${API}/doctor/consultations/${id}/finalize`)
        .set(auth(clinics[1].doctor.token))
        .expect(200);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          request(server)
            .post(`${API}/doctor/consultations/${id}/amendments`)
            .set(auth(clinics[1].doctor.token))
            .send({ content: `Enmienda ${i}`, reason: `Motivo ${i}` }),
        ),
      );
      noServerErrors(results);
      expect(count(results, 201)).toBe(6);
      const [{ n }] = await q(
        'SELECT COUNT(*) n FROM consultation_amendments WHERE consultation_id=?',
        [id],
      );
      expect(Number(n)).toBe(6);
    });

    it('B4. finalizar mientras otro guarda cambios del borrador: lo finalizado coincide con su huella', async () => {
      const patient = await newPatient();
      const appointmentId = await todayAppointment(clinics[2], patient.id);
      const id = (await start(clinics[2], appointmentId).expect(200)).body.id;
      await request(server)
        .patch(`${API}/doctor/consultations/${id}`)
        .set(auth(clinics[2].doctor.token))
        .send({ reason: 'Inicial' })
        .expect(200);
      const patches = Array.from({ length: 8 }, (_, i) =>
        request(server)
          .patch(`${API}/doctor/consultations/${id}`)
          .set(auth(clinics[2].doctor.token))
          .send({
            reason: `Cambio ${i}`,
            medications: [{ drugName: `Droga ${i}`, dose: `${i} mg` }],
            diagnoses: [{ type: 'PRINCIPAL', description: `Dx ${i}` }],
          }),
      );
      const results = await Promise.all([
        ...patches.slice(0, 4),
        request(server)
          .post(`${API}/doctor/consultations/${id}/finalize`)
          .set(auth(clinics[2].doctor.token)),
        ...patches.slice(4),
      ]);
      noServerErrors(results);
      // INVARIANTE: la huella guardada es la del contenido que quedó (nadie
      // pudo colar un cambio entre calcular la huella y cerrar la consulta)
      const integrity = await checkContentHashes(dataSource);
      expect(integrity).toMatchObject({ status: 'ok' });
    });

    it('B5. 5 llamados simultáneos al mismo paciente: la pausa entre llamados se respeta', async () => {
      const patient = await newPatient();
      const appointmentId = await todayAppointment(clinics[3], patient.id);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server)
            .post(`${API}/doctor/appointments/${appointmentId}/call`)
            .set(auth(clinics[3].doctor.token)),
        ),
      );
      noServerErrors(results);
      expect(count(results, 200)).toBe(1);
      const rows = await q(
        'SELECT call_number n FROM appointment_calls WHERE appointment_id=?',
        [appointmentId],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('copia de historia clínica', () => {
    it('C1. 10 pedidos simultáneos para el mismo paciente: uno solo, sin deadlocks', async () => {
      const patient = await newPatient();
      const nextMin = 40;
      const id = await dataSource.getRepository(AppointmentEntity).insert({
        code: generateAppointmentCode(),
        patientId: patient.id,
        professionalId: clinics[0].professionalId,
        specialtyId: clinics[0].specialtyId,
        officeId: clinics[0].officeId,
        date: clinicNow().date,
        startTime: `00:${nextMin}:59`,
        endTime: `00:${nextMin + 1}:00`,
        status: AppointmentStatus.ATENDIDO,
        source: AppointmentSource.RECEPCION,
        contactFirstName: 'P',
        contactLastName: 'Q',
        contactPhone: '1155550000',
      });
      expect(id).toBeTruthy();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(server)
            .post(`${API}/admin/history-exports`)
            .set(auth(reception.token))
            .send({
              patientId: patient.id,
              assignedProfessionalId: clinics[0].professionalId,
              requesterType: 'TITULAR',
              identityChecked: true,
            }),
        ),
      );
      noServerErrors(results);
      expect(count(results, 201)).toBe(1);
      const [{ n }] = await q(
        "SELECT COUNT(*) n FROM history_export_requests WHERE patient_id=? AND status IN ('PENDIENTE','EMITIDA')",
        [patient.id],
      );
      expect(Number(n)).toBe(1);
    });
  });

  describe('aviso de privacidad', () => {
    const publish = (summary: string, policy: string) =>
      request(server)
        .post(`${API}/admin/privacy-notices`)
        .set(auth(admin.token))
        .send({ summary, policy, isDraft: false });

    it('D1. el mismo texto publicado 6 veces a la vez: una sola versión nueva', async () => {
      const before = await currentPrivacyVersion(server);
      const text = unique('Texto idéntico ');
      const results = await Promise.all(
        Array.from({ length: 6 }, () => publish(text, `Política ${text}`)),
      );
      noServerErrors(results);
      const after = await currentPrivacyVersion(server);
      // INVARIANTE: no se pueden crear versiones idénticas (el backend las rechaza con 409)
      expect(after - before).toBe(1);
      expect(count(results, 201) + count(results, 200)).toBe(1);
    });

    it('D2. 6 textos distintos a la vez: todas las versiones quedan numeradas sin repetir', async () => {
      const before = await currentPrivacyVersion(server);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          publish(unique(`Texto ${i} `), `Política ${i}`),
        ),
      );
      noServerErrors(results);
      const ok = results.filter(
        (r) => r.status === 201 || r.status === 200,
      ).length;
      const after = await currentPrivacyVersion(server);
      expect(after - before).toBe(ok);
      // un texto puede repetirse más adelante (A, B, A), pero nunca dos veces seguidas
      // (solo las versiones de esta prueba: la base de pruebas guarda las de antes)
      const all = await q(
        'SELECT version v, content_hash h FROM privacy_notices WHERE version >= ? ORDER BY version',
        [before],
      );
      const consecutive = all.filter(
        (row: any, i: number) => i > 0 && row.h === all[i - 1].h,
      );
      expect(consecutive).toEqual([]);
    });
  });

  describe('configuración y pantallas', () => {
    it('F1. dos cambios simultáneos de campos distintos: los dos se aplican', async () => {
      const [a, b] = await Promise.all([
        request(server)
          .patch(`${API}/admin/settings`)
          .set(auth(admin.token))
          .send({ publicMaxPendingPerPatient: 3 }),
        request(server)
          .patch(`${API}/admin/settings`)
          .set(auth(admin.token))
          .send({ bookingHorizonDays: 45 }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const s = (
        await request(server)
          .get(`${API}/admin/settings`)
          .set(auth(admin.token))
      ).body;
      expect(s.publicMaxPendingPerPatient).toBe(3);
      expect(s.bookingHorizonDays).toBe(45);
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ publicMaxPendingPerPatient: 2 })
        .expect(200);
    });

    it('G1. rotar el token de una pantalla 5 veces a la vez: queda exactamente uno válido', async () => {
      const device = (
        await request(server)
          .post(`${API}/admin/display-devices`)
          .set(auth(admin.token))
          .send({ name: unique('TV ') })
          .expect(201)
      ).body;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server)
            .post(`${API}/admin/display-devices/${device.id}/rotate-token`)
            .set(auth(admin.token)),
        ),
      );
      noServerErrors(results);
      const tokens = results
        .filter((r) => r.status === 200)
        .map((r) => r.body.token as string);
      const checks = await Promise.all(
        tokens.map((t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set('Authorization', `Bearer ${t}`)
            .buffer(false)
            .parse((res: any, cb: any) => {
              res.destroy();
              cb(null, {});
            }),
        ),
      );
      expect(checks.filter((r) => r.status === 200)).toHaveLength(1);
    });
  });

  describe('autenticación', () => {
    it('E1. muchos intentos de login fallidos simultáneos: se bloquea y no revienta', async () => {
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const nick = (
        await q('SELECT nick_usuario n FROM users WHERE id_user=?', [
          user.userId,
        ])
      )[0].n;
      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          request(server)
            .post(`${API}/auth/login`)
            .send({ nickUsuario: nick, password: 'incorrecta-123' }),
        ),
      );
      noServerErrors(results);
      expect(
        results.every((r) => [400, 401, 403, 423, 429].includes(r.status)),
      ).toBe(true);
    });

    it('E2. 30 sesiones válidas a la vez para el mismo usuario: todas entran', async () => {
      await createUserAndLogin(app, Role.MEDICO);
      const user = await createUserAndLogin(app, Role.RECEPCIONISTA);
      const results = await Promise.all(
        Array.from({ length: 30 }, () =>
          request(server).get(`${API}/admin/patients`).set(auth(user.token)),
        ),
      );
      noServerErrors(results);
      expect(count(results, 200)).toBe(30);
    });
  });
});
