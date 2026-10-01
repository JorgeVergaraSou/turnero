/**
 * Pantallas de sala (Fase 3): token de dispositivo y stream SSE de llamados.
 * Se ataca como lo haría alguien con curl: sin token, con tokens falsos,
 * con la sesión de un usuario (aunque sea ADMIN) y con el token de pantalla
 * en otros endpoints. Y se verifica que lo que sale por el stream es SOLO
 * nombre, apellido, consultorio y hora.
 */
import { INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
  uniqueDni,
  unique,
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
import { AppointmentCallEntity } from '../src/clinical/entities/appointment-call.entity';
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';
import { AuditAction } from '../src/audit/audit.enums';
import {
  MAX_STREAMS_PER_DEVICE,
  SNAPSHOT_SIZE,
} from '../src/displays/display-stream.service';

interface SseEvent {
  event: string;
  data: any;
  raw: string;
}

/** Cliente SSE mínimo con fetch + cabecera Authorization (como la pantalla). */
class SseClient {
  status = 0;
  headers: Headers = new Headers();
  events: SseEvent[] = [];
  text = '';
  ended = false;
  private controller = new AbortController();

  static async connect(url: string, token?: string): Promise<SseClient> {
    const client = new SseClient();
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: client.controller.signal,
    });
    client.status = response.status;
    client.headers = response.headers;
    if (response.status === 200 && response.body) {
      void client.pump(response.body.getReader());
    } else {
      await response.body?.cancel();
      client.ended = true;
    }
    return client;
  }

  private async pump(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        this.text += chunk;
        buffer += chunk;
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
          const data = /^data: (.*)$/m.exec(block)?.[1];
          this.events.push({
            event,
            data: data ? JSON.parse(data) : null,
            raw: block,
          });
        }
      }
    } catch {
      // abortado por el test
    }
    this.ended = true;
  }

  async waitFor(predicate: () => boolean, ms = 5000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > ms)
        throw new Error('timeout esperando el stream');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  close() {
    this.controller.abort();
  }
}

describe('Pantallas de sala: token y stream SSE (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let baseUrl: string;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinic: ClinicFixture;
  let patient: { id: number; documentNumber: string };
  let specialtyName: string;
  const clients: SseClient[] = [];

  const connect = async (token?: string) => {
    const client = await SseClient.connect(
      `${baseUrl}${API}/display/stream`,
      token,
    );
    clients.push(client);
    return client;
  };

  const createDevice = async (name = unique('TV ')) => {
    const res = await request(server)
      .post(`${API}/admin/display-devices`)
      .set(auth(admin.token))
      .send({ name })
      .expect(201);
    return res.body as { id: number; name: string; token: string };
  };

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    await app.listen(0);
    server = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
    patient = (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body;
    specialtyName = (
      await dataSource.query('SELECT name FROM specialties WHERE id = ?', [
        clinic.specialtyId,
      ])
    )[0].name;
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());

  afterEach(() => {
    clients.splice(0).forEach((c) => c.close());
  });

  afterAll(async () => {
    await app.close();
  });

  let minuteOffset = 0;
  /** Turno confirmado de hoy; devuelve id y código (para probar que NO sale). */
  async function waitingAppointment() {
    minuteOffset += 1;
    const code = generateAppointmentCode();
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code,
      patientId: patient.id,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: clinicNow().date,
      startTime: `00:${String(minuteOffset).padStart(2, '0')}:00`,
      endTime: `00:${String(minuteOffset).padStart(2, '0')}:30`,
      status: AppointmentStatus.CONFIRMADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Juan',
      contactLastName: 'González',
      contactPhone: '1155550000',
    });
    return { id: inserted.identifiers[0].id as number, code };
  }

  describe('administración de pantallas', () => {
    it('crear devuelve el token UNA vez; el listado nunca lo trae y en la base solo está su hash', async () => {
      const device = await createDevice();
      expect(device.token).toMatch(/^dsp_[A-Za-z0-9_-]{43}$/);

      const list = await request(server)
        .get(`${API}/admin/display-devices`)
        .set(auth(admin.token))
        .expect(200);
      const mine = list.body.find((d: any) => d.id === device.id);
      expect(mine).toBeDefined();
      expect(Object.keys(mine).sort()).toEqual([
        'active',
        'createdAt',
        'id',
        'lastSeenAt',
        'name',
      ]);
      expect(JSON.stringify(list.body)).not.toContain(device.token);

      const [row] = await dataSource.query(
        'SELECT * FROM display_devices WHERE id = ?',
        [device.id],
      );
      expect(row.token_hash).toBe(
        createHash('sha256').update(device.token).digest('hex'),
      );
      expect(JSON.stringify(row)).not.toContain(device.token);
    });

    it.each([
      ['listar', 'get', `${API}/admin/display-devices`],
      ['crear', 'post', `${API}/admin/display-devices`],
      ['editar', 'patch', `${API}/admin/display-devices/1`],
      ['rotar token', 'post', `${API}/admin/display-devices/1/rotate-token`],
    ] as const)(
      '%s: RECEPCIONISTA y MEDICO reciben 403 y sin sesión 401',
      async (_n, method, url) => {
        for (const token of [reception.token, clinic.doctor.token]) {
          await request(server)
            [method](url)
            .set(auth(token))
            .send({ name: 'x' })
            .expect(403);
        }
        await request(server)[method](url).send({ name: 'x' }).expect(401);
      },
    );

    it('un nombre repetido da 409, y nombre vacío o enorme 400', async () => {
      const device = await createDevice();
      await request(server)
        .post(`${API}/admin/display-devices`)
        .set(auth(admin.token))
        .send({ name: device.name })
        .expect(409);
      for (const name of ['', '   ', 'x'.repeat(81), 123, null]) {
        await request(server)
          .post(`${API}/admin/display-devices`)
          .set(auth(admin.token))
          .send({ name })
          .expect(400);
      }
    });

    it('queda auditado sin el token', async () => {
      const device = await createDevice();
      await request(server)
        .post(`${API}/admin/display-devices/${device.id}/rotate-token`)
        .set(auth(admin.token))
        .expect(200);
      const logs = await dataSource.getRepository(AuditLogEntity).find({
        where: {
          resourceType: 'display_device',
          resourceId: String(device.id),
        },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        AuditAction.DISPLAY_CREATE,
        AuditAction.DISPLAY_TOKEN_ROTATE,
      ]);
      expect(JSON.stringify(logs)).not.toMatch(/dsp_/);
    });
  });

  describe('quién puede leer el stream', () => {
    it.each([
      ['sin token', undefined],
      ['token inventado', 'dsp_' + 'a'.repeat(43)],
      ['formato inválido', 'cualquier-cosa'],
      ['token enorme', 'dsp_' + 'a'.repeat(5000)],
    ])('%s → 401 y no se lee nada', async (_n, token) => {
      const client = await connect(token);
      expect(client.status).toBe(401);
      expect(client.events).toEqual([]);
    });

    it('el JWT de un usuario NO sirve, ni siquiera el de ADMIN o el de un médico', async () => {
      for (const jwt of [admin.token, clinic.doctor.token, reception.token]) {
        expect((await connect(jwt)).status).toBe(401);
      }
    });

    it('el token de pantalla NO sirve en ningún otro endpoint', async () => {
      const { token } = await createDevice();
      for (const url of [
        `${API}/auth/profile`,
        `${API}/doctor/appointments`,
        `${API}/admin/patients`,
        `${API}/admin/display-devices`,
        `${API}/admin/appointments`,
        `${API}/admin/audit-logs`,
      ]) {
        await request(server).get(url).set(auth(token)).expect(401);
      }
    });

    it('una pantalla desactivada o con token rotado ya no puede conectarse', async () => {
      const a = await createDevice();
      await request(server)
        .patch(`${API}/admin/display-devices/${a.id}`)
        .set(auth(admin.token))
        .send({ active: false })
        .expect(200);
      expect((await connect(a.token)).status).toBe(401);

      const b = await createDevice();
      await request(server)
        .post(`${API}/admin/display-devices/${b.id}/rotate-token`)
        .set(auth(admin.token))
        .expect(200);
      expect((await connect(b.token)).status).toBe(401);
    });

    it('probar tokens a ráfagas se frena con 429', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 40; i++) {
        statuses.push((await connect('dsp_' + 'b'.repeat(43))).status);
      }
      expect(statuses).toContain(429);
    });
  });

  describe('contenido del stream', () => {
    it('conecta con las cabeceras de SSE (incluida la que evita el buffering de nginx) y manda un snapshot', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      expect(client.status).toBe(200);
      expect(client.headers.get('content-type')).toMatch(/text\/event-stream/);
      expect(client.headers.get('cache-control')).toMatch(/no-cache/);
      expect(client.headers.get('x-accel-buffering')).toBe('no');
      await client.waitFor(() => client.events.length > 1);
      expect(client.events[0]).toMatchObject({
        event: 'config',
        data: { enabled: true, voiceRepeats: 2 },
      });
      expect(client.events[1].event).toBe('snapshot');
      expect(Array.isArray(client.events[1].data.calls)).toBe(true);
    });

    it('un llamado del médico llega en vivo con SOLO nombre, apellido, consultorio y hora', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      await client.waitFor(() =>
        client.events.some((e) => e.event === 'snapshot'),
      );

      const { id, code } = await waitingAppointment();
      await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .set(auth(clinic.doctor.token))
        .expect(200);

      await client.waitFor(() =>
        client.events.some(
          (e) => e.event === 'call' && e.data.key === `${id}-1`,
        ),
      );
      const call = client.events.find((e) => e.event === 'call')!.data;
      expect(Object.keys(call).sort()).toEqual([
        'callNumber',
        'calledAt',
        'calledTime',
        'displayName',
        'key',
        'officeName',
        'spokenName',
      ]);
      expect(call).toMatchObject({
        callNumber: 1,
        displayName: 'Juan González',
      });
      expect(call.calledTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);

      // nada sensible en ninguna parte de lo recibido
      for (const secret of [
        patient.documentNumber,
        specialtyName,
        code,
        'documentNumber',
        'healthInsurance',
        'diagnos',
        'phone',
        'email',
      ]) {
        expect(client.text).not.toContain(secret);
      }
    });

    it(`al conectarse manda como máximo los últimos ${SNAPSHOT_SIZE} llamados, el más nuevo primero, con los mismos campos mínimos`, async () => {
      const { id } = await waitingAppointment();
      // más nuevos que cualquier llamado real hecho antes por otro test
      const base = Date.now() + 5_000;
      for (let n = 1; n <= SNAPSHOT_SIZE + 2; n++) {
        await dataSource.getRepository(AppointmentCallEntity).insert({
          appointmentId: id,
          officeId: clinic.officeId,
          calledByUserId: clinic.doctor.userId,
          callNumber: n,
          calledAt: new Date(base + n * 1000),
        });
      }
      const { token } = await createDevice();
      const client = await connect(token);
      await client.waitFor(() =>
        client.events.some((e) => e.event === 'snapshot'),
      );
      const calls = client.events.find((e) => e.event === 'snapshot')!.data
        .calls;
      expect(calls).toHaveLength(SNAPSHOT_SIZE);
      expect(calls[0].key).toBe(`${id}-${SNAPSHOT_SIZE + 2}`);
      for (const c of calls) {
        expect(Object.keys(c).sort()).toEqual([
          'callNumber',
          'calledAt',
          'calledTime',
          'displayName',
          'key',
          'officeName',
          'spokenName',
        ]);
      }
    });
  });

  describe('configuración del llamado', () => {
    const DEFAULTS = {
      callsEnabled: true,
      callNameFormat: 'FULL',
      callVoiceRepeats: 2,
    };
    const patchSettings = (body: Record<string, unknown>) =>
      request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send(body);

    // la configuración es global: cada test la deja como estaba
    afterEach(async () => {
      await patchSettings(DEFAULTS).expect(200);
    });

    const snapshotReady = (client: SseClient) =>
      client.waitFor(() => client.events.some((e) => e.event === 'snapshot'));

    it.each([
      ['repeticiones 0', { callVoiceRepeats: 0 }],
      ['repeticiones 4', { callVoiceRepeats: 4 }],
      ['repeticiones decimales', { callVoiceRepeats: 1.5 }],
      ['repeticiones como texto', { callVoiceRepeats: 'dos' }],
      ['formato inventado', { callNameFormat: 'SECRETO' }],
      ['formato como número', { callNameFormat: 1 }],
      ['activar como texto', { callsEnabled: 'si' }],
    ])('%s → 400 y no se guarda', async (_n, body) => {
      await patchSettings(body).expect(400);
      const res = await request(server)
        .get(`${API}/admin/settings`)
        .set(auth(admin.token))
        .expect(200);
      expect(res.body).toMatchObject(DEFAULTS);
    });

    it('solo el administrador puede cambiarla', async () => {
      for (const token of [reception.token, clinic.doctor.token]) {
        await request(server)
          .patch(`${API}/admin/settings`)
          .set(auth(token))
          .send({ callVoiceRepeats: 3 })
          .expect(403);
      }
    });

    it('la configuración válida se guarda y el panel público solo sabe si el llamado está activo', async () => {
      await patchSettings({
        callVoiceRepeats: 3,
        callNameFormat: 'CODE',
      }).expect(200);
      const adminView = await request(server)
        .get(`${API}/admin/settings`)
        .set(auth(admin.token))
        .expect(200);
      expect(adminView.body).toMatchObject({
        callVoiceRepeats: 3,
        callNameFormat: 'CODE',
      });
      const pub = await request(server)
        .get(`${API}/public/settings`)
        .expect(200);
      expect(pub.body.callsEnabled).toBe(true);
      // el formato y las repeticiones no son públicos
      expect(pub.body).not.toHaveProperty('callNameFormat');
      expect(pub.body).not.toHaveProperty('callVoiceRepeats');
    });

    it('cambiar la configuración llega a la TV conectada: config nuevo y snapshot al día', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      await snapshotReady(client);
      const before = client.events.length;

      await patchSettings({ callVoiceRepeats: 3 }).expect(200);
      await client.waitFor(() => client.events.length >= before + 2);
      const after = client.events.slice(before);
      expect(after[0]).toMatchObject({
        event: 'config',
        data: { enabled: true, voiceRepeats: 3 },
      });
      expect(after[1].event).toBe('snapshot');
    });

    it('ABBREVIATED: el apellido completo NUNCA llega a la TV (ni en el snapshot ni en los llamados nuevos)', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      await snapshotReady(client);
      const before = client.events.length;

      await patchSettings({ callNameFormat: 'ABBREVIATED' }).expect(200);
      const { id } = await waitingAppointment();
      await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .set(auth(clinic.doctor.token))
        .expect(200);
      await client.waitFor(() =>
        client.events.some(
          (e) => e.event === 'call' && e.data.key === `${id}-1`,
        ),
      );

      const after = client.events.slice(before);
      const call = after.find((e) => e.event === 'call')!.data;
      expect(call.displayName).toBe('Juan G.');
      expect(call.spokenName).toBe('Juan G.');
      expect(JSON.stringify(after)).not.toContain('González');
      // los llamados del snapshot se reformatean con el formato nuevo
      const snapshot = after.find((e) => e.event === 'snapshot')!.data.calls;
      expect(snapshot.every((c: any) => c.displayName === 'Juan G.')).toBe(
        true,
      );
    });

    it('CODE: la TV recibe solo el código del turno, sin ningún nombre', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      await snapshotReady(client);
      const before = client.events.length;

      await patchSettings({ callNameFormat: 'CODE' }).expect(200);
      const { id, code } = await waitingAppointment();
      await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .set(auth(clinic.doctor.token))
        .expect(200);
      await client.waitFor(() =>
        client.events.some(
          (e) => e.event === 'call' && e.data.key === `${id}-1`,
        ),
      );

      const after = client.events.slice(before);
      const call = after.find((e) => e.event === 'call')!.data;
      expect(call.displayName).toBe(`${code.slice(0, 5)} ${code.slice(5)}`);
      expect(call.spokenName).toBe(
        [code.slice(0, 5), code.slice(5)]
          .map((g) => g.split('').join(' '))
          .join(', '),
      );
      expect(JSON.stringify(after)).not.toMatch(/Juan|González/);
    });

    it('desactivado: el médico no puede llamar (409, sin registro) y la TV queda sin nombres', async () => {
      const { token } = await createDevice();
      const client = await connect(token);
      await snapshotReady(client);
      const before = client.events.length;

      await patchSettings({ callsEnabled: false }).expect(200);
      await client.waitFor(() => client.events.length >= before + 2);
      const after = client.events.slice(before);
      expect(after[0]).toMatchObject({
        event: 'config',
        data: { enabled: false },
      });
      expect(after[1].data.calls).toEqual([]);

      const { id } = await waitingAppointment();
      const res = await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .set(auth(clinic.doctor.token))
        .expect(409);
      expect(res.body.message).toMatch(/desactivado/);
      expect(
        await dataSource
          .getRepository(AppointmentCallEntity)
          .count({ where: { appointmentId: id } }),
      ).toBe(0);

      // y una conexión nueva tampoco recibe nombres
      const late = await connect(token);
      await snapshotReady(late);
      expect(
        late.events.find((e) => e.event === 'snapshot')!.data.calls,
      ).toEqual([]);
    });
  });

  describe('conexiones abiertas', () => {
    it('desactivar la pantalla corta el stream que ya estaba abierto', async () => {
      const device = await createDevice();
      const client = await connect(device.token);
      await client.waitFor(() => client.events.length > 0);
      await request(server)
        .patch(`${API}/admin/display-devices/${device.id}`)
        .set(auth(admin.token))
        .send({ active: false })
        .expect(200);
      await client.waitFor(() => client.ended);
    });

    it('rotar el token corta el stream abierto con el token anterior', async () => {
      const device = await createDevice();
      const client = await connect(device.token);
      await client.waitFor(() => client.events.length > 0);
      await request(server)
        .post(`${API}/admin/display-devices/${device.id}/rotate-token`)
        .set(auth(admin.token))
        .expect(200);
      await client.waitFor(() => client.ended);
    });

    it(`una pantalla admite ${MAX_STREAMS_PER_DEVICE} conexiones; la siguiente cierra la más vieja`, async () => {
      const { token } = await createDevice();
      const opened: SseClient[] = [];
      for (let i = 0; i < MAX_STREAMS_PER_DEVICE; i++) {
        const c = await connect(token);
        await c.waitFor(() => c.events.length > 0);
        opened.push(c);
      }
      const extra = await connect(token);
      await extra.waitFor(() => extra.events.length > 0);
      await opened[0].waitFor(() => opened[0].ended);
      expect(opened[1].ended).toBe(false);
      expect(extra.ended).toBe(false);
    });
  });
});
