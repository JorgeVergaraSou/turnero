/**
 * Llamado de pacientes (Fase 1): el médico llama a un paciente en sala de
 * espera. Cubre el caso feliz, las reglas del llamado, IDOR/BOLA, permisos,
 * auditoría sin contenido clínico, el contenido mínimo del evento y la
 * concurrencia.
 */
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';
import { AppointmentEntity } from '../src/appointments/entities/appointment.entity';
import {
  AppointmentSource,
  AppointmentStatus,
} from '../src/appointments/appointment-status';
import { generateAppointmentCode } from '../src/appointments/appointment-code.util';
import { AppointmentEvents } from '../src/appointments/appointment.events';
import { AppointmentCallEntity } from '../src/clinical/entities/appointment-call.entity';
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';
import { AuditAction, AuditResult } from '../src/audit/audit.enums';
import {
  MAX_CALLS_PER_APPOINTMENT,
  MIN_SECONDS_BETWEEN_CALLS,
} from '../src/clinical/appointment-call.policy';

describe('Llamado de pacientes (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinicA: ClinicFixture;
  let clinicB: ClinicFixture;
  let patient: { id: number };
  const events: any[] = [];

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
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
    app
      .get(EventEmitter2)
      .on(AppointmentEvents.CALLED, (payload) => events.push(payload));
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());

  afterAll(async () => {
    await app.close();
  });

  /** Turno directo en la base (se puede fijar estado y fecha). Minuto único
   * por turno para no chocar con el índice de doble reserva. */
  let minuteOffset = 0;
  async function appointment(
    options: { status?: AppointmentStatus; date?: string } = {},
    clinic: ClinicFixture = clinicA,
  ): Promise<number> {
    minuteOffset += 1;
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code: generateAppointmentCode(),
      patientId: patient.id,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: options.date ?? clinicNow().date,
      startTime: `00:${String(minuteOffset).padStart(2, '0')}:00`,
      endTime: `00:${String(minuteOffset).padStart(2, '0')}:30`,
      status: options.status ?? AppointmentStatus.CONFIRMADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Juan',
      contactLastName: 'González',
      contactPhone: '1155550000',
    });
    return inserted.identifiers[0].id as number;
  }

  /** Llamados "viejos" insertados a mano (la tabla es append-only: no se
   * pueden envejecer con un UPDATE). */
  async function seedOldCalls(appointmentId: number, count: number) {
    const old = new Date(Date.now() - 3600 * 1000);
    for (let n = 1; n <= count; n++) {
      await dataSource.getRepository(AppointmentCallEntity).insert({
        appointmentId,
        officeId: clinicA.officeId,
        calledByUserId: clinicA.doctor.userId,
        callNumber: n,
        calledAt: old,
      });
    }
  }

  const call = (id: number | string, token = clinicA.doctor.token) =>
    request(server)
      .post(`${API}/doctor/appointments/${id}/call`)
      .set(auth(token));

  const callsOf = (id: number) =>
    dataSource.getRepository(AppointmentCallEntity).find({
      where: { appointmentId: id },
      order: { callNumber: 'ASC' },
    });

  const auditOf = (id: number, result: AuditResult) =>
    dataSource.getRepository(AuditLogEntity).find({
      where: {
        action: AuditAction.CALL_PATIENT,
        resourceId: String(id),
        result,
      },
    });

  describe('llamado correcto', () => {
    it('llama al paciente en sala: 200, queda registrado y el turno NO cambia de estado', async () => {
      const id = await appointment();
      const res = await call(id).expect(200);
      expect(res.body).toMatchObject({
        callNumber: 1,
        remainingCalls: MAX_CALLS_PER_APPOINTMENT - 1,
        nextCallInSeconds: MIN_SECONDS_BETWEEN_CALLS,
      });
      expect(res.body.officeName).toBeTruthy();

      const rows = await callsOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        callNumber: 1,
        officeId: clinicA.officeId,
        calledByUserId: clinicA.doctor.userId,
      });
      const after = await dataSource
        .getRepository(AppointmentEntity)
        .findOneByOrFail({ id });
      expect(after.status).toBe(AppointmentStatus.CONFIRMADO);
    });

    it('volver a llamar (pasado el intervalo) suma el número de llamado', async () => {
      const id = await appointment();
      await seedOldCalls(id, 1);
      const res = await call(id).expect(200);
      expect(res.body.callNumber).toBe(2);
      expect(await callsOf(id)).toHaveLength(2);
    });

    it('queda auditado sin contenido clínico ni datos del paciente', async () => {
      const id = await appointment();
      await call(id).expect(200);
      const logs = await auditOf(id, AuditResult.SUCCESS);
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(clinicA.doctor.userId);
      expect(logs[0].patientId).toBe(patient.id);
      expect(Object.keys(logs[0].metadata ?? {}).sort()).toEqual([
        'callNumber',
        'officeId',
      ]);
    });

    it('emite appointment.called con SOLO nombre, consultorio y hora (sin DNI ni datos clínicos)', async () => {
      const id = await appointment();
      events.length = 0;
      await call(id).expect(200);
      await new Promise((r) => setTimeout(r, 50));
      const payload = events.find((e) => e.appointmentId === id);
      expect(payload).toBeDefined();
      expect(Object.keys(payload).sort()).toEqual([
        'appointmentCode',
        'appointmentId',
        'callNumber',
        'calledAt',
        'calledTime',
        'officeName',
        'patientFirstName',
        'patientLastName',
      ]);
      expect(payload.patientFirstName).toBe('Juan');
      expect(payload.patientLastName).toBe('González');
      expect(JSON.stringify(payload)).not.toMatch(
        /documentNumber|dni|healthInsurance|specialty|diagnos/i,
      );
    });
  });

  describe('reglas del llamado', () => {
    it.each([
      AppointmentStatus.RESERVADO,
      AppointmentStatus.EN_ATENCION,
      AppointmentStatus.ATENDIDO,
      AppointmentStatus.CANCELADO,
      AppointmentStatus.AUSENTE,
    ])(
      'un turno %s no está en sala de espera → 409 y no se registra',
      async (status) => {
        const id = await appointment({ status });
        await call(id).expect(409);
        expect(await callsOf(id)).toHaveLength(0);
      },
    );

    it('un turno confirmado pero de otro día → 409', async () => {
      const id = await appointment({ date: addDays(clinicNow().date, 1) });
      await call(id).expect(409);
      expect(await callsOf(id)).toHaveLength(0);
    });

    it('volver a llamar enseguida → 429 (no se puede spamear)', async () => {
      const id = await appointment();
      await call(id).expect(200);
      const res = await call(id).expect(429);
      expect(res.body.message).toMatch(/Esperá \d+ segundos/);
      expect(await callsOf(id)).toHaveLength(1);
    });

    it('con el tope de llamados alcanzado → 429', async () => {
      const id = await appointment();
      await seedOldCalls(id, MAX_CALLS_PER_APPOINTMENT);
      await call(id).expect(429);
      expect(await callsOf(id)).toHaveLength(MAX_CALLS_PER_APPOINTMENT);
    });

    it('5 llamados simultáneos al mismo turno: gana exactamente uno', async () => {
      const id = await appointment();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => call(id)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        results.filter((r) => r.status !== 200).every((r) => r.status === 429),
      ).toBe(true);
      expect(await callsOf(id)).toHaveLength(1);
    });

    it('id con formato inválido → 400', async () => {
      await call('abc').expect(400);
    });
  });

  describe('IDOR / BOLA y permisos', () => {
    it('el médico B no puede llamar a un paciente de un turno de A: 404, sin registro y auditado como DENIED', async () => {
      const id = await appointment();
      await call(id, clinicB.doctor.token).expect(404);
      expect(await callsOf(id)).toHaveLength(0);
      expect(await auditOf(id, AuditResult.DENIED)).toHaveLength(1);
    });

    it('un turno ajeno y un id inexistente responden igual (no revela cuáles existen)', async () => {
      const id = await appointment();
      const foreign = await call(id, clinicB.doctor.token);
      const missing = await call(999999999, clinicB.doctor.token);
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body.message).toBe(missing.body.message);
    });

    it.each([
      ['RECEPCIONISTA', () => reception.token],
      ['ADMIN', () => admin.token],
    ])(
      '%s no puede llamar (403) y no se registra nada',
      async (_rol, token) => {
        const id = await appointment();
        await call(id, token()).expect(403);
        expect(await callsOf(id)).toHaveLength(0);
      },
    );

    it('sin sesión → 401', async () => {
      const id = await appointment();
      await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .expect(401);
    });

    it('un MEDICO sin perfil profesional no puede llamar (403)', async () => {
      const id = await appointment();
      const noProfile = await createUserAndLogin(app, Role.MEDICO);
      await call(id, noProfile.token).expect(403);
    });
  });

  describe('integridad en la base', () => {
    it('un llamado hecho no se puede modificar ni borrar (append-only)', async () => {
      const id = await appointment();
      await call(id).expect(200);
      await expect(
        dataSource.query(
          'UPDATE appointment_calls SET call_number = 9 WHERE appointment_id = ?',
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        dataSource.query(
          'DELETE FROM appointment_calls WHERE appointment_id = ?',
          [id],
        ),
      ).rejects.toThrow(/append-only/);
    });
  });
});
