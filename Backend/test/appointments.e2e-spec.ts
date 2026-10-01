import { INestApplication } from '@nestjs/common';
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
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';

describe('Turnos (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  const tomorrow = addDays(clinicNow().date, 1);
  const inTwoDays = addDays(clinicNow().date, 2);

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  const createPatient = async (documentNumber = uniqueDni()) =>
    (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(documentNumber))
        .expect(201)
    ).body;

  const bookByReception = (
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

  describe('flujo público', () => {
    it('lista especialidades y profesionales activos sin login', async () => {
      const specialties = await request(server)
        .get(`${API}/public/specialties`)
        .expect(200);
      expect(
        specialties.body.some((s: any) => s.id === clinic.specialtyId),
      ).toBe(true);

      const professionals = await request(server)
        .get(`${API}/public/professionals?specialtyId=${clinic.specialtyId}`)
        .expect(200);
      expect(professionals.body).toHaveLength(1);
      // nunca datos de cuenta del usuario (nick, email, etc.)
      expect(Object.keys(professionals.body[0]).sort()).toEqual(
        ['firstName', 'id', 'lastName', 'specialties'].sort(),
      );
    });

    it('reserva sin cuenta, obtiene un código y lo consulta con código + DNI', async () => {
      const dni = uniqueDni();
      const booked = await request(server)
        .post(`${API}/public/appointments`)
        .send({
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          date: tomorrow,
          startTime: '08:00',
          patient: patientData(dni),
        })
        .expect(201);
      expect(booked.body.code).toMatch(/^[0-9A-Z]{10}$/);
      expect(booked.body.office.address).toBe('Calle Falsa 123');

      const lookup = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code: booked.body.code, documentNumber: dni })
        .expect(200);
      expect(lookup.body.status).toBe('RESERVADO');
      expect(lookup.body.startTime).toBe('08:00:00');

      // código correcto + DNI incorrecto → mismo 404 que un código inexistente
      await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code: booked.body.code, documentNumber: '99999999' })
        .expect(404);
    });

    it('cancela con código + DNI y el horario queda libre de nuevo', async () => {
      const dni = uniqueDni();
      const booked = await request(server)
        .post(`${API}/public/appointments`)
        .send({
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          date: tomorrow,
          startTime: '08:30',
          patient: patientData(dni),
        })
        .expect(201);

      await request(server)
        .post(`${API}/public/appointments/cancel`)
        .send({ code: booked.body.code, documentNumber: dni })
        .expect(200);

      const patient = await createPatient();
      await bookByReception(patient.id, tomorrow, '08:30').expect(201);
    });

    it('no ofrece ni acepta horarios ocupados', async () => {
      const patient = await createPatient();
      await bookByReception(patient.id, tomorrow, '09:00').expect(201);

      const slots = await request(server)
        .get(
          `${API}/public/professionals/${clinic.professionalId}/availability?from=${tomorrow}&to=${tomorrow}`,
        )
        .expect(200);
      expect(slots.body.some((s: any) => s.startTime === '09:00:00')).toBe(
        false,
      );
      expect(slots.body.some((s: any) => s.startTime === '09:30:00')).toBe(
        true,
      );
    });
  });

  describe('doble reserva', () => {
    it('rechaza reservar un horario ya tomado (409)', async () => {
      const first = await createPatient();
      const second = await createPatient();
      await bookByReception(first.id, tomorrow, '10:00').expect(201);

      const res = await bookByReception(second.id, tomorrow, '10:00').expect(
        409,
      );
      expect(res.body.message).toMatch(/ya no está disponible/);
    });

    it('con 10 reservas simultáneas del mismo horario, gana exactamente una', async () => {
      const patients = await Promise.all(
        Array.from({ length: 10 }, () => createPatient()),
      );

      const results = await Promise.all(
        patients.map((p) => bookByReception(p.id, tomorrow, '11:00')),
      );
      const statuses = results.map((r) => r.status).sort();

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(9);

      const list = await request(server)
        .get(
          `${API}/admin/appointments?from=${tomorrow}&professionalId=${clinic.professionalId}`,
        )
        .set(auth(reception.token))
        .expect(200);
      expect(
        list.body.filter(
          (a: any) => a.startTime === '11:00:00' && a.status !== 'CANCELADO',
        ),
      ).toHaveLength(1);
    });

    it('un mismo paciente no puede tener dos turnos superpuestos', async () => {
      const patient = await createPatient();
      await bookByReception(patient.id, inTwoDays, '12:00').expect(201);
      // mismo horario con OTRO médico (que sí lo tiene libre)
      const other = await createClinic(app, admin.token);
      const res = await request(server)
        .post(`${API}/admin/appointments`)
        .set(auth(reception.token))
        .send({
          professionalId: other.professionalId,
          specialtyId: other.specialtyId,
          patientId: patient.id,
          date: inTwoDays,
          startTime: '12:00',
        })
        .expect(409);
      expect(res.body.message).toMatch(/ya tiene otro turno/);
    });
  });

  describe('validaciones de agenda', () => {
    it('rechaza una fecha pasada', async () => {
      const patient = await createPatient();
      await bookByReception(
        patient.id,
        addDays(clinicNow().date, -1),
        '10:00',
      ).expect(400);
    });

    it('rechaza un horario fuera de la grilla del profesional', async () => {
      const patient = await createPatient();
      await bookByReception(patient.id, tomorrow, '10:10').expect(409);
      await bookByReception(patient.id, tomorrow, '23:00').expect(409);
    });

    it('un bloqueo de agenda saca el horario de la disponibilidad', async () => {
      const blockedDay = addDays(clinicNow().date, 3);
      await request(server)
        .post(`${API}/admin/schedule-exceptions`)
        .set(auth(admin.token))
        .send({
          professionalId: clinic.professionalId,
          type: 'REUNION',
          startDate: blockedDay,
          endDate: blockedDay,
          startTime: '14:00',
          endTime: '15:00',
        })
        .expect(201);

      const patient = await createPatient();
      await bookByReception(patient.id, blockedDay, '14:30').expect(409);
      await bookByReception(patient.id, blockedDay, '15:00').expect(201);
    });

    it('no permite horarios superpuestos para el mismo profesional', async () => {
      await request(server)
        .post(`${API}/admin/schedules`)
        .set(auth(admin.token))
        .send({
          professionalId: clinic.professionalId,
          officeId: clinic.officeId,
          weekday: 1,
          startTime: '07:00',
          endTime: '08:00',
          slotMinutes: 15,
          validFrom: '2020-01-01',
        })
        .expect(409);
    });
  });

  describe('gestión de recepción', () => {
    it('reprograma: mismo código, nuevo horario, historial registrado, horario viejo liberado', async () => {
      const patient = await createPatient();
      const booked = await bookByReception(
        patient.id,
        tomorrow,
        '13:00',
      ).expect(201);

      const moved = await request(server)
        .patch(`${API}/admin/appointments/${booked.body.id}/reschedule`)
        .set(auth(reception.token))
        .send({
          date: inTwoDays,
          startTime: '13:30',
          reason: 'Pedido del paciente',
        })
        .expect(200);
      expect(moved.body.code).toBe(booked.body.code);
      expect(moved.body.date).toBe(inTwoDays);

      const detail = await request(server)
        .get(`${API}/admin/appointments/${booked.body.id}`)
        .set(auth(reception.token))
        .expect(200);
      expect(detail.body.history.at(-1)).toMatchObject({
        fromDate: tomorrow,
        fromStartTime: '13:00:00',
        toDate: inTwoDays,
        toStartTime: '13:30:00',
      });

      const other = await createPatient();
      await bookByReception(other.id, tomorrow, '13:00').expect(201);
    });

    it('confirma y cancela con motivo; un turno cancelado no se reabre', async () => {
      const patient = await createPatient();
      const booked = await bookByReception(
        patient.id,
        tomorrow,
        '16:00',
      ).expect(201);

      await request(server)
        .post(`${API}/admin/appointments/${booked.body.id}/confirm`)
        .set(auth(reception.token))
        .expect(200);
      await request(server)
        .post(`${API}/admin/appointments/${booked.body.id}/cancel`)
        .set(auth(reception.token))
        .send({ reason: 'Llamó para cancelar' })
        .expect(200);
      await request(server)
        .post(`${API}/admin/appointments/${booked.body.id}/confirm`)
        .set(auth(reception.token))
        .expect(409);
    });

    it('no permite marcar ausente un turno que todavía no empezó', async () => {
      const patient = await createPatient();
      const booked = await bookByReception(
        patient.id,
        tomorrow,
        '16:30',
      ).expect(201);
      await request(server)
        .post(`${API}/admin/appointments/${booked.body.id}/no-show`)
        .set(auth(reception.token))
        .expect(409);
    });
  });

  describe('permisos', () => {
    it('un MEDICO no puede gestionar turnos ni pacientes de recepción', async () => {
      await request(server)
        .get(`${API}/admin/appointments`)
        .set(auth(clinic.doctor.token))
        .expect(403);
      await request(server)
        .get(`${API}/admin/patients`)
        .set(auth(clinic.doctor.token))
        .expect(403);
    });

    it('un RECEPCIONISTA puede LEER lo que usa su inicio: turnos de varios días, profesionales y ausencias', async () => {
      const week = addDays(clinicNow().date, 7);
      await request(server)
        .get(`${API}/admin/appointments`)
        .query({ from: clinicNow().date, to: week })
        .set(auth(reception.token))
        .expect(200);
      await request(server)
        .get(`${API}/admin/professionals`)
        .set(auth(reception.token))
        .expect(200);
      await request(server)
        .get(`${API}/admin/schedule-exceptions`)
        .query({ from: clinicNow().date, to: week })
        .set(auth(reception.token))
        .expect(200);
    });

    it('un RECEPCIONISTA no puede administrar agenda ni especialidades', async () => {
      await request(server)
        .post(`${API}/admin/specialties`)
        .set(auth(reception.token))
        .send({ name: 'No debería' })
        .expect(403);
      await request(server)
        .post(`${API}/admin/schedule-exceptions`)
        .set(auth(reception.token))
        .send({
          type: 'FERIADO',
          startDate: tomorrow,
          endDate: tomorrow,
        })
        .expect(403);
    });

    it('sin token, la gestión administrativa responde 401', async () => {
      await request(server).get(`${API}/admin/appointments`).expect(401);
      await request(server).get(`${API}/admin/patients`).expect(401);
    });
  });
});
