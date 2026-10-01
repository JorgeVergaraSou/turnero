import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  AppointmentEventPayload,
  AppointmentEvents,
} from '../src/appointments/appointment.events';

describe('Recordatorios de turno (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let reminders: AppointmentRemindersService;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  let patientId: number;
  const received: AppointmentEventPayload[] = [];

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    reminders = app.get(AppointmentRemindersService);
    app
      .get(EventEmitter2)
      .on(AppointmentEvents.REMINDER, (payload: AppointmentEventPayload) =>
        received.push(payload),
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
    await setReminderHours(24);
  }, 120000);

  afterAll(async () => {
    await setReminderHours(24);
    await app.close();
  });

  async function setReminderHours(reminderHoursBefore: number) {
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ reminderHoursBefore })
      .expect(200);
  }

  /**
   * Turno directo en la base, a `minutesFromNow` minutos de ahora (hora del
   * consultorio). `bookedDaysAgo` simula cuándo se reservó: los turnos
   * reservados DENTRO de la ventana de aviso no se recuerdan.
   */
  async function insertAppointment(
    minutesFromNow: number,
    options: { status?: AppointmentStatus; bookedDaysAgo?: number } = {},
  ): Promise<number> {
    const start = moment().tz(CLINIC_TIMEZONE).add(minutesFromNow, 'minutes');
    const end = moment.min(
      start.clone().add(20, 'minutes'),
      start.clone().endOf('day'), // CHECK start < end: no cruzar la medianoche
    );
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code: generateAppointmentCode(),
      patientId,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: start.format('YYYY-MM-DD'),
      startTime: start.format('HH:mm:00'),
      endTime: end.format('HH:mm:ss'),
      status: options.status ?? AppointmentStatus.RESERVADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Paciente',
      contactLastName: 'Prueba',
      contactPhone: '1155550000',
      contactEmail: 'paciente@example.com',
    });
    const id = inserted.identifiers[0].id as number;
    if (options.bookedDaysAgo) {
      await dataSource.query(
        'UPDATE appointments SET created_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?',
        [options.bookedDaysAgo, id],
      );
    }
    return id;
  }

  const reminderSentAt = async (id: number) =>
    (await dataSource.getRepository(AppointmentEntity).findOneByOrFail({ id }))
      .reminderSentAt;

  it('emite el recordatorio de un turno que entró en la ventana, con los datos para avisar', async () => {
    const id = await insertAppointment(6 * 60, { bookedDaysAgo: 3 });

    const sent = await reminders.sendDueReminders();

    expect(sent).toContain(id);
    expect(await reminderSentAt(id)).not.toBeNull();
    const payload = received.find((p) => p.appointmentId === id);
    expect(payload).toMatchObject({
      contactEmail: 'paciente@example.com',
      specialtyName: expect.any(String),
      officeAddress: 'Calle Falsa 123',
    });
  });

  it('nunca manda dos recordatorios del mismo turno (ni en corridas simultáneas)', async () => {
    const id = await insertAppointment(6 * 60 + 5, { bookedDaysAgo: 3 });

    const [a, b] = await Promise.all([
      reminders.sendDueReminders(),
      reminders.sendDueReminders(),
    ]);
    const again = await reminders.sendDueReminders();

    expect([...a, ...b].filter((x) => x === id)).toHaveLength(1);
    expect(again).not.toContain(id);
    expect(received.filter((p) => p.appointmentId === id)).toHaveLength(1);
  });

  it('no recuerda un turno reservado dentro de la ventana (ya recibió la confirmación)', async () => {
    const id = await insertAppointment(6 * 60 + 10); // reservado "ahora"

    expect(await reminders.sendDueReminders()).not.toContain(id);
    expect(await reminderSentAt(id)).toBeNull();
  });

  it('no recuerda turnos fuera de la ventana ni turnos cancelados', async () => {
    const tooFar = await insertAppointment(30 * 60, { bookedDaysAgo: 3 });
    const cancelled = await insertAppointment(6 * 60 + 15, {
      bookedDaysAgo: 3,
      status: AppointmentStatus.CANCELADO,
    });

    const sent = await reminders.sendDueReminders();

    expect(sent).not.toContain(tooFar);
    expect(sent).not.toContain(cancelled);
  });

  it('con la anticipación en 0 horas, los recordatorios están desactivados', async () => {
    const id = await insertAppointment(6 * 60 + 20, { bookedDaysAgo: 3 });
    await setReminderHours(0);
    try {
      expect(await reminders.sendDueReminders()).toEqual([]);
      expect(await reminderSentAt(id)).toBeNull();
    } finally {
      await setReminderHours(24);
    }
  });

  it('reprogramar vuelve a habilitar el recordatorio para la fecha nueva', async () => {
    const id = await insertAppointment(6 * 60 + 25, { bookedDaysAgo: 3 });
    expect(await reminders.sendDueReminders()).toContain(id);

    await request(server)
      .patch(`${API}/admin/appointments/${id}/reschedule`)
      .set(auth(reception.token))
      .send({ date: addDays(clinicNow().date, 5), startTime: '10:00' })
      .expect(200);

    expect(await reminderSentAt(id)).toBeNull();
  });

  it('la anticipación se configura desde la configuración del admin, con rango válido', async () => {
    const res = await request(server)
      .get(`${API}/admin/settings`)
      .set(auth(admin.token))
      .expect(200);
    expect(res.body.reminderHoursBefore).toBe(24);
    // no es un dato público
    const pub = await request(server).get(`${API}/public/settings`).expect(200);
    expect(pub.body).not.toHaveProperty('reminderHoursBefore');

    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send({ reminderHoursBefore: 100 })
      .expect(400);
  });
});
