import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
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
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';

describe('Historia clínica y seguridad (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinicA: ClinicFixture;
  let clinicB: ClinicFixture;
  let patientA: { id: number }; // tiene turno con el médico A
  let patientOther: { id: number }; // sin relación con el médico A

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinicA = await createClinic(app, admin.token);
    clinicB = await createClinic(app, admin.token);

    const newPatient = async () =>
      (
        await request(server)
          .post(`${API}/admin/patients`)
          .set(auth(reception.token))
          .send(patientData(uniqueDni()))
          .expect(201)
      ).body;
    patientA = await newPatient();
    patientOther = await newPatient();
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  /**
   * Turno de HOY directo en la base: iniciar atención exige un turno del
   * día, y por la API no se puede reservar un horario que ya pasó (el test
   * puede correr a cualquier hora). Minuto único por turno para no chocar
   * con el índice de doble reserva.
   */
  let minuteOffset = 0;
  async function todayAppointment(clinic: ClinicFixture, patientId: number) {
    minuteOffset += 1;
    const start = `00:${String(minuteOffset).padStart(2, '0')}:00`;
    const end = `00:${String(minuteOffset).padStart(2, '0')}:30`;
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code: generateAppointmentCode(),
      patientId,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: clinicNow().date,
      startTime: start,
      endTime: end,
      status: AppointmentStatus.CONFIRMADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Paciente',
      contactLastName: 'Prueba',
      contactPhone: '1155550000',
    });
    return inserted.identifiers[0].id as number;
  }

  const deniedAuditExists = async (userId: number, patientId: number) =>
    dataSource.getRepository(AuditLogEntity).exists({
      where: { actorUserId: userId, patientId, result: 'DENIED' as any },
    });

  describe('atención médica completa', () => {
    let consultationId: number;
    let appointmentId: number;

    it('el médico inicia la atención: turno EN_ATENCION + consulta BORRADOR', async () => {
      appointmentId = await todayAppointment(clinicA, patientA.id);
      const res = await request(server)
        .post(`${API}/doctor/appointments/${appointmentId}/start`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.status).toBe('BORRADOR');
      consultationId = res.body.id;

      const agenda = await request(server)
        .get(`${API}/doctor/appointments`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(agenda.body.find((a: any) => a.id === appointmentId).status).toBe(
        'EN_ATENCION',
      );
    });

    it('iniciar dos veces es idempotente (devuelve la misma consulta)', async () => {
      const res = await request(server)
        .post(`${API}/doctor/appointments/${appointmentId}/start`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.id).toBe(consultationId);
    });

    it('guarda el borrador con diagnóstico, medicación, estudios y signos vitales', async () => {
      const res = await request(server)
        .patch(`${API}/doctor/consultations/${consultationId}`)
        .set(auth(clinicA.doctor.token))
        .send({
          reason: 'Dolor de garganta',
          anamnesis: 'Tres días de evolución',
          systolicBp: 120,
          diastolicBp: 80,
          temperatureC: 37.8,
          diagnoses: [
            {
              type: 'PRINCIPAL',
              description: 'Faringitis aguda',
              codeSystem: 'CIE-10',
              code: 'J02.9',
            },
          ],
          medications: [
            {
              drugName: 'Ibuprofeno',
              dose: '400 mg',
              frequency: 'c/8 h',
              duration: '5 días',
            },
          ],
          studyRequests: [{ type: 'LABORATORIO', description: 'Hemograma' }],
        })
        .expect(200);
      expect(res.body.vitalSigns.temperatureC).toBe(37.8);
      expect(res.body.diagnoses).toHaveLength(1);
      expect(res.body.medications[0].drugName).toBe('Ibuprofeno');
    });

    it('otro médico no puede ver ni editar el borrador ajeno', async () => {
      await request(server)
        .patch(`${API}/doctor/consultations/${consultationId}`)
        .set(auth(clinicB.doctor.token))
        .send({ reason: 'intento' })
        .expect(404); // no es el autor: 404, no revela que la consulta existe
    });

    it('finaliza: consulta FINALIZADA con hash, turno ATENDIDO', async () => {
      const res = await request(server)
        .post(`${API}/doctor/consultations/${consultationId}/finalize`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.status).toBe('FINALIZADA');
      expect(res.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.finalizedByUserId).toBe(clinicA.doctor.userId);
    });

    it('una consulta finalizada NO se puede modificar (409)', async () => {
      const res = await request(server)
        .patch(`${API}/doctor/consultations/${consultationId}`)
        .set(auth(clinicA.doctor.token))
        .send({ reason: 'cambio silencioso' })
        .expect(409);
      expect(res.body.message).toMatch(/enmienda/);
    });

    it('la base también rechaza modificar una consulta finalizada (trigger)', async () => {
      await expect(
        dataSource.query(
          "UPDATE medical_consultations SET reason = 'hack' WHERE id = ?",
          [consultationId],
        ),
      ).rejects.toThrow(/finalizada/i);
      await expect(
        dataSource.query(
          'DELETE FROM consultation_diagnoses WHERE consultation_id = ?',
          [consultationId],
        ),
      ).rejects.toThrow(/finalizada/i);
      await expect(
        dataSource.query('DELETE FROM audit_logs LIMIT 1'),
      ).rejects.toThrow(/append-only/i);
    });

    it('la corrección se hace con una enmienda trazable', async () => {
      const res = await request(server)
        .post(`${API}/doctor/consultations/${consultationId}/amendments`)
        .set(auth(clinicA.doctor.token))
        .send({
          content: 'Se agrega: amigdalas con exudado',
          reason: 'Omisión en examen físico',
        })
        .expect(201);
      expect(res.body.amendments).toHaveLength(1);
      expect(res.body.reason).toBe('Dolor de garganta'); // el original no cambió
    });

    it('la historia clínica longitudinal muestra la consulta finalizada', async () => {
      const res = await request(server)
        .get(`${API}/doctor/patients/${patientA.id}/clinical-history`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].diagnoses[0].code).toBe('J02.9');
    });

    it('los accesos clínicos PERMITIDOS quedan auditados, sin contenido clínico', async () => {
      // un acceso más: la ficha del paciente
      await request(server)
        .get(`${API}/doctor/patients/${patientA.id}`)
        .set(auth(clinicA.doctor.token))
        .expect(200);

      const logs = await dataSource.getRepository(AuditLogEntity).find({
        where: {
          actorUserId: clinicA.doctor.userId,
          patientId: patientA.id,
          result: 'SUCCESS' as any,
        },
      });
      const actions = logs.map((l) => l.action);

      // todo el recorrido de la atención, cada paso con quién y qué paciente
      expect(actions).toEqual(
        expect.arrayContaining([
          'START_ATTENTION',
          'CREATE_MEDICAL_CONSULTATION',
          'UPDATE_MEDICAL_CONSULTATION',
          'FINALIZE_MEDICAL_CONSULTATION',
          'AMEND_MEDICAL_CONSULTATION',
          'VIEW_CLINICAL_HISTORY',
          'VIEW_PATIENT',
        ]),
      );
      const finalize = logs.find(
        (l) => l.action === 'FINALIZE_MEDICAL_CONSULTATION',
      )!;
      expect(finalize.resourceType).toBe('medical_consultation');
      expect(finalize.metadata).toHaveProperty('contentHash');

      // lo que se registró del borrador son los NOMBRES de las secciones
      // tocadas, nunca sus valores
      const update = logs.find(
        (l) => l.action === 'UPDATE_MEDICAL_CONSULTATION',
      )!;
      expect(update.metadata).toMatchObject({
        fields: expect.arrayContaining(['reason', 'diagnoses', 'medications']),
      });

      // ni motivo, ni diagnóstico, ni medicación en ningún registro
      const everything = JSON.stringify(logs);
      expect(everything).not.toMatch(
        /garganta|Faringitis|Ibuprofeno|Hemograma|exudado/i,
      );
    });
  });

  describe('IDOR / BOLA', () => {
    it('médico A NO accede a un paciente con el que no tiene relación (403 + auditoría DENIED)', async () => {
      await request(server)
        .get(`${API}/doctor/patients/${patientOther.id}/clinical-history`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
      await request(server)
        .get(`${API}/doctor/patients/${patientOther.id}`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
      expect(
        await deniedAuditExists(clinicA.doctor.userId, patientOther.id),
      ).toBe(true);
    });

    it('médico B NO accede a la historia del paciente de A', async () => {
      await request(server)
        .get(`${API}/doctor/patients/${patientA.id}/clinical-history`)
        .set(auth(clinicB.doctor.token))
        .expect(403);
      expect(await deniedAuditExists(clinicB.doctor.userId, patientA.id)).toBe(
        true,
      );
    });

    it('un paciente inexistente responde igual que uno sin relación (no enumera IDs)', async () => {
      await request(server)
        .get(`${API}/doctor/patients/999999999/clinical-history`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
    });

    it('médico B no puede iniciar la atención de un turno de A (404, no revela que existe)', async () => {
      const appointmentId = await todayAppointment(clinicA, patientA.id);
      await request(server)
        .post(`${API}/doctor/appointments/${appointmentId}/start`)
        .set(auth(clinicB.doctor.token))
        .expect(404);
    });

    it('la agenda del médico solo trae sus propios turnos', async () => {
      await todayAppointment(clinicB, patientOther.id);
      const res = await request(server)
        .get(`${API}/doctor/appointments`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every(
          (a: any) => a.professional.id === clinicA.professionalId,
        ),
      ).toBe(true);
    });

    it('próximos turnos: el rango de varios días trae solo los turnos futuros propios', async () => {
      const tomorrow = addDays(clinicNow().date, 1);
      const inFiveDays = addDays(clinicNow().date, 5);
      const book = (clinic: ClinicFixture, date: string, startTime: string) =>
        request(server)
          .post(`${API}/admin/appointments`)
          .set(auth(reception.token))
          .send({
            professionalId: clinic.professionalId,
            specialtyId: clinic.specialtyId,
            patientId: patientA.id,
            date,
            startTime,
          })
          .expect(201);
      const mine1 = await book(clinicA, tomorrow, '09:00');
      const mine2 = await book(clinicA, inFiveDays, '10:30');
      const other = await book(clinicB, tomorrow, '11:00');

      const res = await request(server)
        .get(`${API}/doctor/appointments`)
        .query({ from: tomorrow, to: addDays(clinicNow().date, 14) })
        .set(auth(clinicA.doctor.token))
        .expect(200);
      const ids = res.body.map((a: any) => a.id);

      expect(ids).toEqual(
        expect.arrayContaining([mine1.body.id, mine2.body.id]),
      );
      expect(ids).not.toContain(other.body.id);
      // ordenados por fecha y hora (la pantalla los agrupa por día)
      const keys = res.body.map((a: any) => `${a.date} ${a.startTime}`);
      expect(keys).toEqual([...keys].sort());
    });
  });

  describe('administradores y recepción sin acceso clínico', () => {
    it('ADMIN no puede leer historias clínicas (sin pase automático)', async () => {
      await request(server)
        .get(`${API}/doctor/patients/${patientA.id}/clinical-history`)
        .set(auth(admin.token))
        .expect(403);
    });

    it('RECEPCIONISTA no puede leer historias clínicas ni iniciar atenciones', async () => {
      await request(server)
        .get(`${API}/doctor/patients/${patientA.id}/clinical-history`)
        .set(auth(reception.token))
        .expect(403);
      const appointmentId = await todayAppointment(clinicA, patientA.id);
      await request(server)
        .post(`${API}/doctor/appointments/${appointmentId}/start`)
        .set(auth(reception.token))
        .expect(403);
    });
  });

  describe('autenticación', () => {
    it('token inválido → 401', async () => {
      await request(server)
        .get(`${API}/doctor/dashboard`)
        .set(auth('no-es-un-jwt'))
        .expect(401);
    });

    it('token expirado → 401', async () => {
      const expired = jwt.sign(
        {
          idUser: clinicA.doctor.userId,
          nickUsuario: 'x',
          role: Role.MEDICO,
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        process.env.SECRET_WORD!,
      );
      await request(server)
        .get(`${API}/doctor/dashboard`)
        .set(auth(expired))
        .expect(401);
    });

    it('token firmado con otro secreto → 401', async () => {
      const forged = jwt.sign(
        { idUser: clinicA.doctor.userId, role: Role.MEDICO },
        'otro-secreto-cualquiera-123456',
      );
      await request(server)
        .get(`${API}/doctor/dashboard`)
        .set(auth(forged))
        .expect(401);
    });

    it('login de médico y de administrativo con credenciales válidas', async () => {
      const doctor = await createUserAndLogin(app, Role.MEDICO);
      const receptionist = await createUserAndLogin(app, Role.RECEPCIONISTA);
      expect(doctor.token).toBeTruthy();
      expect(receptionist.token).toBeTruthy();
    });

    it('un MEDICO sin perfil profesional no accede al panel médico', async () => {
      const orphan = await createUserAndLogin(app, Role.MEDICO);
      await request(server)
        .get(`${API}/doctor/dashboard`)
        .set(auth(orphan.token))
        .expect(403);
    });
  });
});
