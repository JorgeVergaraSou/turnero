/**
 * Avisos por WhatsApp hechos a mano por recepción: lista de a quién le toca el
 * aviso (mismas ventanas que el mail), con el enlace wa.me y el mensaje armado.
 * No se manda nada solo.
 */
import { INestApplication } from '@nestjs/common';
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
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';

describe('Avisos por WhatsApp a mano (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  let patientId: number;
  const repo = () => dataSource.getRepository(AppointmentEntity);

  beforeAll(async () => {
    process.env.FRONTEND_URL = 'https://turnos.example.com';
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
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
      phone?: string;
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
      contactPhone: options.phone ?? '11 5555-0000',
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

  const list = async (token = reception.token) =>
    (
      await request(server)
        .get(`${API}/admin/whatsapp-reminders`)
        .set(auth(token))
        .expect(200)
    ).body as Array<{
      appointmentId: number;
      stage: 1 | 2;
      phone: string;
      whatsappUrl: string | null;
      message: string;
    }>;
  const find = async (id: number) =>
    (await list()).filter((i) => i.appointmentId === id);
  const mark = (id: number, stage: number, body: object = {}) =>
    request(server)
      .post(`${API}/admin/whatsapp-reminders/${id}/${stage}/mark`)
      .set(auth(reception.token))
      .send(body);

  describe('a quién le toca', () => {
    it('un turno a 6 h figura como primer aviso, con el enlace de WhatsApp y el mensaje armado', async () => {
      const id = await insertAppointment(6 * 60);
      const [item] = await find(id);
      expect(item.stage).toBe(1);
      expect(item.whatsappUrl).toMatch(
        /^https:\/\/wa\.me\/5491155550000\?text=/,
      );
      expect(item.phone).toBe('11 5555-0000');
      expect(item.message).toContain('Hola Mariana');
      expect(item.message).toMatch(
        new RegExp(
          `https://turnos\\.example\\.com/confirmar\\?t=${id}\\.[\\w-]{24}`,
        ),
      );
      // el enlace lleva exactamente ese mensaje
      expect(decodeURIComponent(item.whatsappUrl!.split('?text=')[1])).toBe(
        item.message,
      );
    });

    it('el mensaje no dice con qué médico ni de qué especialidad es el turno', async () => {
      const id = await insertAppointment(6 * 60 + 11);
      const [item] = await find(id);
      const specialty = (
        await dataSource.query('SELECT name FROM specialties WHERE id = ?', [
          clinic.specialtyId,
        ])
      )[0].name;
      expect(item.message).not.toContain(specialty);
      expect(item.message).not.toMatch(/Dr\.|Dra\.|Dr |Dra /);
      expect(JSON.stringify(Object.keys(item))).not.toMatch(
        /professional|specialty/i,
      );
    });

    it('un turno a 90 min figura solo como último aviso (2.º), nunca los dos juntos', async () => {
      const id = await insertAppointment(90);
      const items = await find(id);
      expect(items.map((i) => i.stage)).toEqual([2]);
      expect(items[0].message).toMatch(/tu turno es hoy|tu turno es el/);
    });

    it('un teléfono que no sirve para WhatsApp figura igual, sin enlace', async () => {
      const id = await insertAppointment(6 * 60 + 5, { phone: '5555-0000' });
      const [item] = await find(id);
      expect(item.whatsappUrl).toBeNull();
      expect(item.phone).toBe('5555-0000');
    });

    it.each([
      ['ya avisó que viene', { confirmed: true }],
      [
        'ya llegó (estado Confirmado)',
        { status: AppointmentStatus.CONFIRMADO },
      ],
      ['cancelado', { status: AppointmentStatus.CANCELADO }],
      ['reservado dentro de la ventana', { bookedDaysAgo: 0 }],
    ])('no figura si el paciente %s', async (_c, options) => {
      const id = await insertAppointment(6 * 60 + 20, options);
      expect(await find(id)).toEqual([]);
    });

    it('no figura un turno fuera de la ventana ni uno que ya pasó', async () => {
      const far = await insertAppointment(30 * 60);
      const past = await insertAppointment(-60);
      expect(await find(far)).toEqual([]);
      expect(await find(past)).toEqual([]);
    });

    it('con el segundo aviso en 0 solo hay primer aviso, y cubre toda su ventana', async () => {
      await setHours(24, 0);
      try {
        const near = await insertAppointment(80);
        expect((await find(near)).map((i) => i.stage)).toEqual([1]);
      } finally {
        await setHours(24, 2);
      }
    });

    it('con el primer aviso en 0 no hay primer aviso', async () => {
      await setHours(0, 2);
      try {
        const far = await insertAppointment(6 * 60 + 7);
        const near = await insertAppointment(60);
        expect(await find(far)).toEqual([]);
        expect((await find(near)).map((i) => i.stage)).toEqual([2]);
      } finally {
        await setHours(24, 2);
      }
    });

    it('el aviso por mail ya enviado no lo oculta: son registros independientes', async () => {
      const id = await insertAppointment(6 * 60 + 9);
      await repo().update(id, { reminderSentAt: new Date() });
      expect((await find(id)).map((i) => i.stage)).toEqual([1]);
    });

    it('viene ordenado: el turno más próximo primero', async () => {
      const later = await insertAppointment(8 * 60);
      const sooner = await insertAppointment(5 * 60);
      const ids = (await list()).map((i) => i.appointmentId);
      expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(later));
    });
  });

  describe('marcar como avisado', () => {
    it('al marcar deja de figurar; marcar de nuevo no duplica ni falla', async () => {
      const id = await insertAppointment(6 * 60 + 13);
      expect((await mark(id, 1).expect(200)).body).toEqual({ marked: true });
      expect(await find(id)).toEqual([]);
      expect((await mark(id, 1).expect(200)).body).toEqual({ marked: false });
      const logs = await dataSource.getRepository(AuditLogEntity).find({
        where: {
          action: 'WHATSAPP_REMINDER_MARK' as any,
          resourceId: String(id),
        },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata).toEqual({ stage: 1, outcome: 'SENT' });
      expect(logs[0].patientId).toBe(patientId);
    });

    it('descartarlo («no avisar por este medio») también lo saca de la lista y queda registrado', async () => {
      const id = await insertAppointment(6 * 60 + 14);
      await mark(id, 1, { outcome: 'SKIPPED' }).expect(200);
      expect(await find(id)).toEqual([]);
      const [log] = await dataSource.getRepository(AuditLogEntity).find({
        where: {
          action: 'WHATSAPP_REMINDER_MARK' as any,
          resourceId: String(id),
        },
      });
      expect(log.metadata).toEqual({ stage: 1, outcome: 'SKIPPED' });
    });

    it('marcar el primer aviso no oculta el segundo cuando le toque', async () => {
      const id = await insertAppointment(6 * 60 + 15);
      await mark(id, 1).expect(200);
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
      expect((await find(id)).map((i) => i.stage)).toEqual([2]);
    });

    it.each([
      ['etapa 3', 3, {}],
      ['etapa 0', 0, {}],
      ['resultado inválido', 1, { outcome: 'ENVIADO' }],
      ['campo desconocido', 1, { extra: true }],
    ])('rechaza %s (400)', async (_c, stage, body) => {
      const id = await insertAppointment(6 * 60 + 16);
      await mark(id, stage, body).expect(400);
      expect(await find(id)).toHaveLength(1);
    });

    it('un turno inexistente da 404', async () => {
      await mark(999999999, 1).expect(404);
    });

    it('reprogramar vuelve a habilitar los avisos', async () => {
      const id = await insertAppointment(6 * 60 + 17);
      await mark(id, 1).expect(200);
      await repo().update(id, { whatsapp2SentAt: new Date() });
      await request(server)
        .patch(`${API}/admin/appointments/${id}/reschedule`)
        .set(auth(reception.token))
        .send({ date: addDays(clinicNow().date, 5), startTime: '10:00' })
        .expect(200);
      const saved = await repo().findOneByOrFail({ id });
      expect(saved.whatsapp1SentAt).toBeNull();
      expect(saved.whatsapp2SentAt).toBeNull();
    });
  });

  describe('permisos', () => {
    it('recepción y administración ven la lista; el médico no; sin sesión 401', async () => {
      await list(reception.token);
      await list(admin.token);
      await request(server)
        .get(`${API}/admin/whatsapp-reminders`)
        .set(auth(clinic.doctor.token))
        .expect(403);
      await request(server).get(`${API}/admin/whatsapp-reminders`).expect(401);
    });

    it('marcar lo puede hacer recepción; el médico no; sin sesión 401', async () => {
      const id = await insertAppointment(6 * 60 + 18);
      await request(server)
        .post(`${API}/admin/whatsapp-reminders/${id}/1/mark`)
        .set(auth(clinic.doctor.token))
        .send({})
        .expect(403);
      await request(server)
        .post(`${API}/admin/whatsapp-reminders/${id}/1/mark`)
        .send({})
        .expect(401);
      expect(await find(id)).toHaveLength(1);
    });
  });
});
