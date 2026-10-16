/**
 * Avisos en tiempo real de cambios en la agenda (SSE): cuando recepción marca
 * que llegó un paciente, el panel del médico asignado se entera solo. Cada
 * médico recibe únicamente lo de SUS turnos, y el aviso no lleva datos
 * personales.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
  uniqueDni,
} from './e2e-helpers';
import { ClinicFixture, createClinic, patientData } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { clinicNow } from '../src/common/utils/clinic-time.util';
import { AppointmentEntity } from '../src/appointments/entities/appointment.entity';
import {
  AppointmentSource,
  AppointmentStatus,
} from '../src/appointments/appointment-status';
import { generateAppointmentCode } from '../src/appointments/appointment-code.util';
import {
  AgendaStreamService,
  MAX_AGENDA_STREAMS_PER_USER,
} from '../src/appointments/agenda-stream.service';

interface Received {
  event: string;
  data: any;
}

/** Abre un stream SSE con fetch nativo-like (http) y va juntando los eventos. */
function openStream(port: number, path: string, token?: string) {
  const received: Received[] = [];
  let statusCode = 0;
  let headers: http.IncomingHttpHeaders = {};
  let request_: http.ClientRequest;
  const ready = new Promise<void>((resolve, reject) => {
    request_ = http.get(
      {
        host: '127.0.0.1',
        port,
        path: `${API}${path}`,
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        statusCode = res.statusCode ?? 0;
        headers = res.headers;
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
            const raw = /^data: (.*)$/m.exec(block)?.[1];
            received.push({ event, data: raw ? JSON.parse(raw) : null });
          }
        });
        resolve();
      },
    );
    request_.on('error', reject);
  });
  return {
    ready,
    received,
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    changes: () => received.filter((r) => r.event === 'change'),
    close: () => request_.destroy(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check() && Date.now() - start < ms) await sleep(50);
}

describe('Avisos de cambios en la agenda (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinicA: ClinicFixture;
  let clinicB: ClinicFixture;
  let patient: { id: number };
  const opened: Array<{ close: () => void }> = [];

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinicA = await createClinic(app, admin.token);
    clinicB = await createClinic(app, admin.token);
    patient = (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body;
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterEach(() => {
    opened.splice(0).forEach((s) => s.close());
  });
  afterAll(async () => {
    await app.close();
  });

  const open = (path: string, token?: string) => {
    const stream = openStream(port, path, token);
    opened.push(stream);
    return stream;
  };

  let minute = 0;
  async function todayAppointment(clinic: ClinicFixture) {
    minute += 1;
    const mm = String(minute).padStart(2, '0');
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code: generateAppointmentCode(),
      patientId: patient.id,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: clinicNow().date,
      startTime: `00:${mm}:00`,
      endTime: `00:${mm}:30`,
      status: AppointmentStatus.RESERVADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Paciente',
      contactLastName: 'Prueba',
      contactPhone: '1155550000',
    });
    return inserted.identifiers[0].id as number;
  }

  describe('permisos', () => {
    it.each(['/doctor/agenda/stream', '/admin/agenda/stream'])(
      '%s sin sesión → 401',
      async (path) => {
        const s = open(path);
        await s.ready;
        expect(s.statusCode).toBe(401);
      },
    );

    it('el panel del médico no admite a recepción ni a administración (403)', async () => {
      for (const token of [reception.token, admin.token]) {
        const s = open('/doctor/agenda/stream', token);
        await s.ready;
        expect(s.statusCode).toBe(403);
      }
    });

    it('el stream de recepción no admite a un médico (403)', async () => {
      const s = open('/admin/agenda/stream', clinicA.doctor.token);
      await s.ready;
      expect(s.statusCode).toBe(403);
    });

    it('es un stream de eventos, sin caché', async () => {
      const s = open('/doctor/agenda/stream', clinicA.doctor.token);
      await s.ready;
      expect(s.statusCode).toBe(200);
      expect(s.headers['content-type']).toMatch(/text\/event-stream/);
      expect(s.headers['cache-control']).toMatch(/no-cache|no-store/);
      await until(() => s.received.some((r) => r.event === 'ready'));
      expect(s.received[0].event).toBe('ready');
    });
  });

  describe('cuando recepción marca que llegó un paciente', () => {
    it('el médico asignado recibe el aviso; el otro médico no; recepción también', async () => {
      const appointmentId = await todayAppointment(clinicA);
      const doctorA = open('/doctor/agenda/stream', clinicA.doctor.token);
      const doctorB = open('/doctor/agenda/stream', clinicB.doctor.token);
      const desk = open('/admin/agenda/stream', reception.token);
      await Promise.all([doctorA.ready, doctorB.ready, desk.ready]);
      await until(() =>
        [doctorA, doctorB, desk].every((s) =>
          s.received.some((r) => r.event === 'ready'),
        ),
      );

      await request(server)
        .post(`${API}/admin/appointments/${appointmentId}/confirm`)
        .set(auth(reception.token))
        .expect(200);

      await until(
        () => doctorA.changes().length > 0 && desk.changes().length > 0,
      );
      await sleep(300); // margen para comprobar que al otro médico NO le llega
      expect(doctorA.changes()).toHaveLength(1);
      expect(desk.changes()).toHaveLength(1);
      expect(doctorB.changes()).toHaveLength(0);
      expect(doctorA.changes()[0].data).toEqual({
        appointmentId,
        professionalId: clinicA.professionalId,
        date: clinicNow().date,
      });
    });

    it('el aviso solo lleva ids y fecha: nada de nombres ni datos personales', async () => {
      const appointmentId = await todayAppointment(clinicA);
      const s = open('/doctor/agenda/stream', clinicA.doctor.token);
      await s.ready;
      await until(() => s.received.some((r) => r.event === 'ready'));
      await request(server)
        .post(`${API}/admin/appointments/${appointmentId}/confirm`)
        .set(auth(reception.token))
        .expect(200);
      await until(() => s.changes().length > 0);
      expect(Object.keys(s.changes()[0].data).sort()).toEqual([
        'appointmentId',
        'date',
        'professionalId',
      ]);
      expect(JSON.stringify(s.received)).not.toMatch(
        /Paciente|Prueba|1155550000/,
      );
    });
  });

  describe('otros cambios de la agenda', () => {
    it('cancelar y marcar ausente avisan', async () => {
      const a = await todayAppointment(clinicA);
      const s = open('/doctor/agenda/stream', clinicA.doctor.token);
      await s.ready;
      await until(() => s.received.some((r) => r.event === 'ready'));
      await request(server)
        .post(`${API}/admin/appointments/${a}/cancel`)
        .set(auth(reception.token))
        .send({ reason: 'prueba' })
        .expect(200);
      await until(() => s.changes().length >= 1);
      expect(s.changes()).toHaveLength(1);
    });

    it('iniciar y finalizar una atención avisan a recepción', async () => {
      const a = await todayAppointment(clinicA);
      await request(server)
        .post(`${API}/admin/appointments/${a}/confirm`)
        .set(auth(reception.token))
        .expect(200);
      const desk = open('/admin/agenda/stream', reception.token);
      await desk.ready;
      await until(() => desk.received.some((r) => r.event === 'ready'));

      const started = await request(server)
        .post(`${API}/doctor/appointments/${a}/start`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      await until(() => desk.changes().length >= 1);
      expect(desk.changes()).toHaveLength(1);

      await request(server)
        .patch(`${API}/doctor/consultations/${started.body.id}`)
        .set(auth(clinicA.doctor.token))
        .send({ reason: 'Control' })
        .expect(200);
      await request(server)
        .post(`${API}/doctor/consultations/${started.body.id}/finalize`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      await until(() => desk.changes().length >= 2);
      expect(desk.changes()).toHaveLength(2);
    });

    it('un cambio que falla (turno ya cancelado) no manda ningún aviso', async () => {
      const a = await todayAppointment(clinicA);
      await request(server)
        .post(`${API}/admin/appointments/${a}/cancel`)
        .set(auth(reception.token))
        .send({ reason: 'prueba' })
        .expect(200);
      const s = open('/doctor/agenda/stream', clinicA.doctor.token);
      await s.ready;
      await until(() => s.received.some((r) => r.event === 'ready'));
      await request(server)
        .post(`${API}/admin/appointments/${a}/confirm`)
        .set(auth(reception.token))
        .expect(409);
      await sleep(300);
      expect(s.changes()).toHaveLength(0);
    });
  });

  it('un médico puede tener varias pestañas abiertas y todas reciben el aviso', async () => {
    const a = await todayAppointment(clinicA);
    const tabs = [1, 2, 3].map(() =>
      open('/doctor/agenda/stream', clinicA.doctor.token),
    );
    await Promise.all(tabs.map((t) => t.ready));
    await until(() =>
      tabs.every((t) => t.received.some((r) => r.event === 'ready')),
    );
    await request(server)
      .post(`${API}/admin/appointments/${a}/confirm`)
      .set(auth(reception.token))
      .expect(200);
    await until(() => tabs.every((t) => t.changes().length > 0));
    tabs.forEach((t) => expect(t.changes()).toHaveLength(1));
  });

  describe('recursos', () => {
    const openConnections = () =>
      [...(app.get(AgendaStreamService) as any).connections.values()].reduce(
        (sum: number, set: Set<unknown>) => sum + set.size,
        0,
      );

    it('un usuario con muchas pestañas abiertas no pasa el tope: la más vieja se cierra', async () => {
      const streams = Array.from(
        { length: MAX_AGENDA_STREAMS_PER_USER + 5 },
        () => open('/doctor/agenda/stream', clinicA.doctor.token),
      );
      await Promise.all(streams.map((s) => s.ready));
      await until(() =>
        streams.every((s) => s.received.some((r) => r.event === 'ready')),
      );
      await sleep(300);
      expect(openConnections()).toBeLessThanOrEqual(
        MAX_AGENDA_STREAMS_PER_USER,
      );
    });

    it('al cerrar todas las conexiones no queda ninguna registrada (sin fugas)', async () => {
      const streams = Array.from({ length: 12 }, (_, i) =>
        open('/admin/agenda/stream', i % 2 ? reception.token : admin.token),
      );
      await Promise.all(streams.map((s) => s.ready));
      await until(() =>
        streams.every((s) => s.received.some((r) => r.event === 'ready')),
      );
      opened.splice(0).forEach((s) => s.close());
      await until(() => openConnections() === 0, 5000);
      expect(openConnections()).toBe(0);
    });
  });
});
