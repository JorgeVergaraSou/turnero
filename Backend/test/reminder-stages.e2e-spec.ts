/**
 * Recordatorios en dos etapas (24 h y 2 h por defecto) y confirmación de
 * asistencia del paciente por el enlace del segundo aviso. "Confirmó que viene"
 * es un dato APARTE de "llegó" (estado CONFIRMADO).
 */
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getStorageToken } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import moment from 'moment-timezone';
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
import {
  addDays,
  CLINIC_TIMEZONE,
  clinicNow,
} from '../src/common/utils/clinic-time.util';
import { AppointmentEntity } from '../src/appointments/entities/appointment.entity';
import {
  AppointmentSource,
  AppointmentStatus,
} from '../src/appointments/appointment-status';
import { generateAppointmentCode } from '../src/appointments/appointment-code.util';
import { AppointmentRemindersService } from '../src/appointments/appointment-reminders.service';
import {
  AppointmentEvents,
  AppointmentReminderPayload,
} from '../src/appointments/appointment.events';
import { signConfirmToken } from '../src/appointments/appointment-confirm-token.util';
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';

describe('Recordatorios en dos etapas y confirmación del paciente (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let reminders: AppointmentRemindersService;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  let patientId: number;
  const received: AppointmentReminderPayload[] = [];
  const repo = () => dataSource.getRepository(AppointmentEntity);

  beforeAll(async () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    reminders = app.get(AppointmentRemindersService);
    app
      .get(EventEmitter2)
      .on(AppointmentEvents.REMINDER, (p: AppointmentReminderPayload) =>
        received.push(p),
      );
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
    patientId = (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body.id;
    await setHours(24, 2);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await setHours(24, 2);
    await app.close();
  });

  async function setHours(first: number, second: number) {
    // primero lo que no choca con la regla "el segundo más cerca que el primero"
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ reminderHoursBefore: 72, secondReminderHoursBefore: 0 })
      .expect(200);
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ reminderHoursBefore: first, secondReminderHoursBefore: second })
      .expect(200);
  }

  /** segundos distintos: dos turnos del mismo médico no pueden empezar a la misma hora exacta */
  let seq = 0;
  async function insertAppointment(
    minutesFromNow: number,
    options: {
      status?: AppointmentStatus;
      bookedDaysAgo?: number;
      confirmed?: boolean;
    } = {},
  ): Promise<number> {
    const start = moment().tz(CLINIC_TIMEZONE).add(minutesFromNow, 'minutes');
    const end = moment.min(
      start.clone().add(20, 'minutes'),
      start.clone().endOf('day'),
    );
    const inserted = await repo().insert({
      code: generateAppointmentCode(),
      patientId,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: start.format('YYYY-MM-DD'),
      startTime: start.format('HH:mm:') + String(seq++ % 60).padStart(2, '0'),
      endTime: end.format('HH:mm:ss'),
      status: options.status ?? AppointmentStatus.RESERVADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Mariana',
      contactLastName: 'Reino',
      contactPhone: '1155550000',
      contactEmail: 'paciente@example.com',
      ...(options.confirmed && { patientConfirmedAt: new Date() }),
    });
    const id = inserted.identifiers[0].id as number;
    await dataSource.query(
      'UPDATE appointments SET created_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?',
      [options.bookedDaysAgo ?? 3, id],
    );
    return id;
  }

  const get = (id: number) => repo().findOneByOrFail({ id });
  const eventsOf = (id: number) =>
    received.filter((p) => p.appointmentId === id);
  const tokenOf = async (id: number) =>
    signConfirmToken(id, (await get(id)).code);

  describe('las dos etapas', () => {
    it('1.ª etapa: un turno a 6 h recibe el primer aviso, con el enlace para confirmar', async () => {
      const id = await insertAppointment(6 * 60);
      expect(await reminders.sendDueReminders()).toContain(id);
      const [event] = eventsOf(id);
      expect(event.stage).toBe(1);
      expect(event.confirmUrl).toMatch(
        new RegExp(`^http://localhost:5173/confirmar\\?t=${id}\\.[\\w-]{24}$`),
      );
      const saved = await get(id);
      expect(saved.reminderSentAt).not.toBeNull();
      expect(saved.reminder2SentAt).toBeNull();
    });

    it('2.ª etapa: un turno a 90 min recibe solo el segundo aviso, nunca los dos juntos', async () => {
      const id = await insertAppointment(90);
      expect(await reminders.sendDueReminders()).toContain(id);
      expect(eventsOf(id)).toHaveLength(1);
      expect(eventsOf(id)[0].stage).toBe(2);
      const saved = await get(id);
      expect(saved.reminder2SentAt).not.toBeNull();
      expect(saved.reminderSentAt).toBeNull();
      // y la 1.ª no se lo manda después
      await reminders.sendDueReminders();
      expect(eventsOf(id)).toHaveLength(1);
    });

    it('un turno que ya recibió el primero recibe el segundo al acercarse', async () => {
      const id = await insertAppointment(6 * 60);
      await reminders.sendDueReminders();
      expect(eventsOf(id).map((e) => e.stage)).toEqual([1]);
      // simula el paso del tiempo: el turno ahora está a 90 min
      const start = moment().tz(CLINIC_TIMEZONE).add(90, 'minutes');
      await dataSource.query(
        'UPDATE appointments SET date = ?, start_time = ?, end_time = ? WHERE id = ?',
        [
          start.format('YYYY-MM-DD'),
          start.format('HH:mm:') + String(seq++ % 60).padStart(2, '0'),
          moment
            .min(start.clone().add(20, 'minutes'), start.clone().endOf('day'))
            .format('HH:mm:ss'),
          id,
        ],
      );
      await reminders.sendDueReminders();
      expect(eventsOf(id).map((e) => e.stage)).toEqual([1, 2]);
    });

    it('el segundo aviso no sale si el paciente ya avisó que viene', async () => {
      const id = await insertAppointment(90, { confirmed: true });
      expect(await reminders.sendDueReminders()).not.toContain(id);
      expect((await get(id)).reminder2SentAt).toBeNull();
    });

    it('el segundo aviso no sale si el paciente ya llegó (estado CONFIRMADO) ni si se canceló', async () => {
      const arrived = await insertAppointment(90, {
        status: AppointmentStatus.CONFIRMADO,
      });
      const cancelled = await insertAppointment(95, {
        status: AppointmentStatus.CANCELADO,
      });
      const sent = await reminders.sendDueReminders();
      expect(sent).not.toContain(arrived);
      expect(sent).not.toContain(cancelled);
    });

    it('un turno reservado dentro de la ventana del segundo aviso no lo recibe (acaba de reservar)', async () => {
      const id = await insertAppointment(90, { bookedDaysAgo: 0 });
      expect(await reminders.sendDueReminders()).not.toContain(id);
    });

    it('nunca manda dos veces el mismo aviso, ni en corridas simultáneas', async () => {
      const id = await insertAppointment(100);
      const [a, b] = await Promise.all([
        reminders.sendDueReminders(),
        reminders.sendDueReminders(),
      ]);
      expect([...a, ...b].filter((x) => x === id)).toHaveLength(1);
      expect(eventsOf(id)).toHaveLength(1);
    });

    it('con el segundo aviso en 0 no se manda, y el primero sigue funcionando', async () => {
      await setHours(24, 0);
      try {
        const near = await insertAppointment(90);
        const far = await insertAppointment(6 * 60 + 7);
        const sent = await reminders.sendDueReminders();
        expect(sent).toContain(far);
        // sin segunda etapa, la primera cubre también al turno cercano, y nadie recibe un "2"
        expect(sent).toContain(near);
        expect(eventsOf(near).map((e) => e.stage)).toEqual([1]);
        expect(eventsOf(far).map((e) => e.stage)).toEqual([1]);
      } finally {
        await setHours(24, 2);
      }
    });

    it('con el primer aviso en 0 solo sale el segundo', async () => {
      await setHours(0, 2);
      try {
        const far = await insertAppointment(6 * 60 + 9);
        const near = await insertAppointment(60);
        const sent = await reminders.sendDueReminders();
        expect(sent).not.toContain(far);
        expect(sent).toContain(near);
      } finally {
        await setHours(24, 2);
      }
    });

    it('reprogramar reinicia los dos avisos y la confirmación del paciente', async () => {
      const id = await insertAppointment(90, { confirmed: true });
      await repo().update(id, {
        reminderSentAt: new Date(),
        reminder2SentAt: new Date(),
      });
      await request(server)
        .patch(`${API}/admin/appointments/${id}/reschedule`)
        .set(auth(reception.token))
        .send({ date: addDays(clinicNow().date, 5), startTime: '10:00' })
        .expect(200);
      const saved = await get(id);
      expect(saved.reminderSentAt).toBeNull();
      expect(saved.reminder2SentAt).toBeNull();
      expect(saved.patientConfirmedAt).toBeNull();
    });
  });

  describe('configuración de los dos avisos', () => {
    it('se lee y se guarda desde Configuración', async () => {
      const res = await request(server)
        .get(`${API}/admin/settings`)
        .set(auth(admin.token))
        .expect(200);
      expect(res.body).toMatchObject({
        reminderHoursBefore: 24,
        secondReminderHoursBefore: 2,
      });
      const pub = await request(server)
        .get(`${API}/public/settings`)
        .expect(200);
      expect(pub.body).not.toHaveProperty('secondReminderHoursBefore');
    });

    it.each([
      [
        'el segundo igual al primero',
        { reminderHoursBefore: 24, secondReminderHoursBefore: 24 },
      ],
      [
        'el segundo más lejos que el primero',
        { reminderHoursBefore: 2, secondReminderHoursBefore: 24 },
      ],
      ['más de 72 horas', { secondReminderHoursBefore: 100 }],
      ['negativo', { secondReminderHoursBefore: -1 }],
      ['decimal', { secondReminderHoursBefore: 1.5 }],
      ['texto', { secondReminderHoursBefore: 'dos' }],
    ])('rechaza %s (400)', async (_c, body) => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send(body)
        .expect(400);
    });

    it('solo administración puede cambiarlos', async () => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(reception.token))
        .send({ secondReminderHoursBefore: 1 })
        .expect(403);
    });
  });

  describe('enlace "confirmo que voy"', () => {
    const info = (t: string) =>
      request(server).get(`${API}/public/appointments/confirm`).query({ t });
    const confirm = (t: unknown) =>
      request(server).post(`${API}/public/appointments/confirm`).send({ t });

    it('el paciente ve lo mínimo: nombre de pila, día, hora y consultorio', async () => {
      const id = await insertAppointment(120);
      const res = await info(await tokenOf(id)).expect(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'canConfirm',
        'confirmed',
        'date',
        'firstName',
        'officeName',
        'startTime',
      ]);
      expect(res.body).toMatchObject({
        firstName: 'Mariana',
        confirmed: false,
        canConfirm: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /Reino|1155550000|paciente@example/,
      );
    });

    it('confirmar guarda "confirmó que viene" y NO cambia el estado del turno (no es "llegó")', async () => {
      const id = await insertAppointment(120);
      const res = await confirm(await tokenOf(id)).expect(200);
      expect(res.body).toMatchObject({ confirmed: true });
      const saved = await get(id);
      expect(saved.patientConfirmedAt).not.toBeNull();
      expect(saved.status).toBe(AppointmentStatus.RESERVADO);
    });

    it('queda auditado una sola vez, aunque se confirme dos veces', async () => {
      const id = await insertAppointment(120);
      const t = await tokenOf(id);
      await confirm(t).expect(200);
      const again = await confirm(t).expect(200);
      expect(again.body.confirmed).toBe(true);
      const logs = await dataSource.getRepository(AuditLogEntity).find({
        where: {
          action: 'APPOINTMENT_PATIENT_CONFIRM' as any,
          resourceId: String(id),
        },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBeNull();
      expect(logs[0].patientId).toBe(patientId);
    });

    it('recepción lo ve en el turno, separado del estado', async () => {
      const id = await insertAppointment(120);
      await confirm(await tokenOf(id)).expect(200);
      const res = await request(server)
        .get(`${API}/admin/appointments/${id}`)
        .set(auth(reception.token))
        .expect(200);
      expect(res.body.status).toBe('RESERVADO');
      expect(res.body.patientConfirmedAt).toBeTruthy();
    });

    it('el enlace de otro turno, o con la firma alterada, da 404 genérico', async () => {
      const a = await insertAppointment(120);
      const b = await insertAppointment(125);
      const tokenA = await tokenOf(a);
      const sigA = tokenA.split('.')[1];
      await info(`${b}.${sigA}`).expect(404);
      await confirm(`${b}.${sigA}`).expect(404);
      const tampered = `${a}.${sigA.slice(0, -1)}${sigA.endsWith('a') ? 'b' : 'a'}`;
      await confirm(tampered).expect(404);
      expect((await get(b)).patientConfirmedAt).toBeNull();
      // un id que no existe no se distingue de una firma mala
      const missing = await info('999999999.aaaaaaaaaaaaaaaaaaaaaaaa').expect(
        404,
      );
      const bad = await info(`${a}.aaaaaaaaaaaaaaaaaaaaaaaa`).expect(404);
      expect(missing.body.message).toBe(bad.body.message);
    });

    it.each([
      undefined,
      null,
      42,
      '',
      'basura',
      '1.corta',
      { $ne: 1 },
      ['1.aaaaaaaaaaaaaaaaaaaaaaaa'],
    ])(
      'confirmar con un enlace mal formado (%j) → 400 y no confirma nada',
      async (value) => {
        await confirm(value).expect(400);
      },
    );

    it('consultar con un enlace mal formado da 404', async () => {
      await info('basura').expect(404);
      await request(server)
        .get(`${API}/public/appointments/confirm`)
        .expect(404);
    });

    it('un turno cancelado, ya pasado o en que el paciente ya llegó no admite confirmar (409)', async () => {
      const cancelled = await insertAppointment(120, {
        status: AppointmentStatus.CANCELADO,
      });
      const arrived = await insertAppointment(125, {
        status: AppointmentStatus.CONFIRMADO,
      });
      const past = await insertAppointment(-120);
      for (const id of [cancelled, arrived, past]) {
        const t = await tokenOf(id);
        expect((await info(t).expect(200)).body.canConfirm).toBe(false);
        await confirm(t).expect(409);
        expect((await get(id)).patientConfirmedAt).toBeNull();
      }
    });

    it('es público (sin sesión) y no se cachea el estado en el navegador del paciente', async () => {
      const id = await insertAppointment(120);
      const res = await info(await tokenOf(id)).expect(200);
      expect(res.headers['cache-control'] ?? '').not.toMatch(/public/);
    });

    it('tiene límite de intentos por IP', async () => {
      const t = '1.aaaaaaaaaaaaaaaaaaaaaaaa';
      let blocked = false;
      for (let i = 0; i < 40; i++) {
        const res = await info(t);
        if (res.status === 429) {
          blocked = true;
          break;
        }
      }
      expect(blocked).toBe(true);
    });
  });
});
