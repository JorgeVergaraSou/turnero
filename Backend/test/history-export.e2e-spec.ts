/**
 * Copia de la historia clínica para el paciente (Fase 2 de cumplimiento
 * legal): recepción registra el pedido, el médico con relación genera el PDF,
 * administración solo ve el trámite. El PDF no se guarda y la auditoría no
 * lleva contenido clínico.
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
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
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';
import { computeChainHash } from '../src/clinical/history-export/history-export-pdf';

const SECRET_REASON = 'SECRETO-CLINICO-MOTIVO-XYZ';
const SECRET_AMENDMENT = 'SECRETO-CLINICO-ENMIENDA-XYZ';

describe('Copia de la historia clínica (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinicA: ClinicFixture;
  let clinicB: ClinicFixture;
  let clinicC: ClinicFixture;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinicA = await createClinic(app, admin.token);
    clinicB = await createClinic(app, admin.token);
    clinicC = await createClinic(app, admin.token);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await app.close();
  });

  let minuteOffset = 0;
  async function todayAppointment(clinic: ClinicFixture, patientId: number) {
    minuteOffset += 1;
    const mm = String(minuteOffset).padStart(2, '0');
    const inserted = await dataSource.getRepository(AppointmentEntity).insert({
      code: generateAppointmentCode(),
      patientId,
      professionalId: clinic.professionalId,
      specialtyId: clinic.specialtyId,
      officeId: clinic.officeId,
      date: clinicNow().date,
      startTime: `00:${mm}:00`,
      endTime: `00:${mm}:30`,
      status: AppointmentStatus.CONFIRMADO,
      source: AppointmentSource.RECEPCION,
      contactFirstName: 'Paciente',
      contactLastName: 'Prueba',
      contactPhone: '1155550000',
    });
    return inserted.identifiers[0].id as number;
  }

  const newPatient = async () =>
    (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body as { id: number };

  /** Atiende una consulta con el médico de la clínica; opcionalmente la finaliza. */
  async function consultation(
    clinic: ClinicFixture,
    patientId: number,
    finalize: boolean,
  ) {
    const appointmentId = await todayAppointment(clinic, patientId);
    const started = await request(server)
      .post(`${API}/doctor/appointments/${appointmentId}/start`)
      .set(auth(clinic.doctor.token))
      .expect(200);
    const id = started.body.id as number;
    await request(server)
      .patch(`${API}/doctor/consultations/${id}`)
      .set(auth(clinic.doctor.token))
      .send({
        reason: SECRET_REASON,
        diagnoses: [{ type: 'PRINCIPAL', description: 'Faringitis aguda' }],
        medications: [{ drugName: 'Ibuprofeno', dose: '400 mg' }],
        studyRequests: [{ type: 'LABORATORIO', description: 'Hemograma' }],
      })
      .expect(200);
    if (finalize) {
      await request(server)
        .post(`${API}/doctor/consultations/${id}/finalize`)
        .set(auth(clinic.doctor.token))
        .expect(200);
    }
    return id;
  }

  const createRequest = (
    body: Record<string, unknown>,
    token = reception.token,
  ) =>
    request(server)
      .post(`${API}/admin/history-exports`)
      .set(auth(token))
      .send(body);

  const titular = (patientId: number, professionalId: number) => ({
    patientId,
    assignedProfessionalId: professionalId,
    requesterType: 'TITULAR',
    identityChecked: true,
  });

  const issue = (
    id: number,
    token: string,
    body: unknown = { identityConfirmed: true },
  ) =>
    request(server)
      .post(`${API}/doctor/history-exports/${id}/issue`)
      .set(auth(token))
      .send(body as object);

  const row = async (id: number) =>
    (
      await dataSource.query(
        'SELECT * FROM history_export_requests WHERE id = ?',
        [id],
      )
    )[0];

  const audits = (action: string, id: number) =>
    dataSource.getRepository(AuditLogEntity).find({
      where: { action: action as any, resourceId: String(id) },
      order: { id: 'ASC' },
    });

  const listUploads = () => {
    const dir = join(process.cwd(), 'uploads');
    return existsSync(dir)
      ? readdirSync(dir, { recursive: true }).map(String)
      : null;
  };

  async function patientWithHistory() {
    const patient = await newPatient();
    await consultation(clinicA, patient.id, true);
    return patient;
  }

  describe('circuito completo', () => {
    let patient: { id: number };
    let r1: number;
    let r2: number;
    let uploadsBefore: string[] | null;

    beforeAll(async () => {
      patient = await newPatient();
      const first = await consultation(clinicA, patient.id, true);
      await consultation(clinicA, patient.id, true);
      // una atención en borrador (no se incluye) y un turno con el médico B (le da relación)
      await consultation(clinicA, patient.id, false);
      await todayAppointment(clinicB, patient.id);
      await request(server)
        .post(`${API}/doctor/consultations/${first}/amendments`)
        .set(auth(clinicA.doctor.token))
        .send({ content: SECRET_AMENDMENT, reason: 'Corrección' })
        .expect(201);
      uploadsBefore = listUploads();
    }, 120000);

    it('recepción ve qué médicos atendieron al paciente (dato administrativo)', async () => {
      const res = await request(server)
        .get(`${API}/admin/history-exports/candidates?patientId=${patient.id}`)
        .set(auth(reception.token))
        .expect(200);
      const ids = res.body.map((p: any) => p.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          clinicA.professionalId,
          clinicB.professionalId,
        ]),
      );
      expect(ids).not.toContain(clinicC.professionalId);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'firstName',
        'id',
        'lastName',
        'specialties',
      ]);
    });

    it.each([
      ['sin verificar el DNI', { identityChecked: false }],
      ['sin el campo de verificación', { identityChecked: undefined }],
      ['representante sin datos', { requesterType: 'REPRESENTANTE' }],
      ['campo desconocido', { clinicalNote: 'x' }],
      ['tipo de solicitante inválido', { requesterType: 'OTRO' }],
    ])('registrar el pedido %s → 400', async (_c, patch) => {
      await createRequest({
        ...titular(patient.id, clinicA.professionalId),
        ...patch,
      }).expect(400);
    });

    it('un médico sin relación con el paciente no puede asignarse → 400', async () => {
      await createRequest(titular(patient.id, clinicC.professionalId)).expect(
        400,
      );
    });

    it('paciente inexistente → 404', async () => {
      await createRequest(titular(999999999, clinicA.professionalId)).expect(
        404,
      );
    });

    it('solo recepción registra: administración y médico reciben 403', async () => {
      const body = titular(patient.id, clinicA.professionalId);
      await createRequest(body, admin.token).expect(403);
      await createRequest(body, clinicA.doctor.token).expect(403);
    });

    it('recepción registra el pedido: pendiente, plazo de 48 h y sin datos clínicos', async () => {
      const res = await createRequest(
        titular(patient.id, clinicA.professionalId),
      ).expect(201);
      r1 = res.body.id;
      expect(res.body.status).toBe('PENDIENTE');
      expect(
        new Date(res.body.dueAt).getTime() -
          new Date(res.body.requestedAt).getTime(),
      ).toBe(48 * 3600_000);
      expect(res.body.overdue).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('SECRETO');
      expect(Object.keys(res.body)).not.toEqual(
        expect.arrayContaining(['reason', 'anamnesis', 'diagnoses']),
      );
      const saved = await row(r1);
      expect(saved.identity_checked).toBe(1);
      expect(saved.requested_by_user_id).toBe(reception.userId);
    });

    it('no se pueden tener dos pedidos en curso para el mismo paciente → 409', async () => {
      await createRequest(titular(patient.id, clinicA.professionalId)).expect(
        409,
      );
    });

    it('recepción, administración y el médico asignado lo ven; otro médico no', async () => {
      for (const token of [reception.token, admin.token]) {
        const res = await request(server)
          .get(`${API}/admin/history-exports`)
          .set(auth(token))
          .expect(200);
        expect(res.body.map((r: any) => r.id)).toContain(r1);
      }
      const mine = await request(server)
        .get(`${API}/doctor/history-exports`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(mine.body.map((r: any) => r.id)).toContain(r1);
      const other = await request(server)
        .get(`${API}/doctor/history-exports`)
        .set(auth(clinicB.doctor.token))
        .expect(200);
      expect(other.body.map((r: any) => r.id)).not.toContain(r1);
    });

    it('el resumen cuenta los pedidos abiertos para cada rol', async () => {
      const all = await request(server)
        .get(`${API}/admin/history-exports/summary`)
        .set(auth(reception.token))
        .expect(200);
      expect(all.body.open).toBeGreaterThanOrEqual(1);
      expect(all.body).toHaveProperty('overdue');
      expect(all.body.nextDueAt).toBeTruthy();
      const mine = await request(server)
        .get(`${API}/doctor/history-exports/summary`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(mine.body.open).toBe(1);
      const other = await request(server)
        .get(`${API}/doctor/history-exports/summary`)
        .set(auth(clinicC.doctor.token))
        .expect(200);
      expect(other.body).toEqual({
        open: 0,
        overdue: 0,
        nextDueAt: null,
        nextMinutesLeft: null,
      });
    });

    it('administración reasigna; recepción no. Solo a un médico con relación', async () => {
      const url = `${API}/admin/history-exports/${r1}/reassign`;
      const to = (professionalId: number) => ({ professionalId });
      await request(server)
        .patch(url)
        .set(auth(reception.token))
        .send(to(clinicB.professionalId))
        .expect(403);
      await request(server)
        .patch(url)
        .set(auth(admin.token))
        .send(to(clinicC.professionalId))
        .expect(400);
      await request(server)
        .patch(url)
        .set(auth(admin.token))
        .send(to(clinicA.professionalId))
        .expect(409);
      await request(server)
        .patch(url)
        .set(auth(admin.token))
        .send(to(clinicB.professionalId))
        .expect(200);
      expect((await row(r1)).assigned_professional_id).toBe(
        clinicB.professionalId,
      );
      await request(server)
        .patch(url)
        .set(auth(admin.token))
        .send(to(clinicA.professionalId))
        .expect(200);
      const logs = await audits('HISTORY_EXPORT_REASSIGN', r1);
      expect(logs).toHaveLength(2);
      expect(logs[0].metadata).toEqual({
        fromProfessionalId: clinicA.professionalId,
        toProfessionalId: clinicB.professionalId,
      });
    });

    it('cancelar exige motivo y solo lo hace recepción', async () => {
      const url = `${API}/admin/history-exports/${r1}/cancel`;
      await request(server)
        .post(url)
        .set(auth(reception.token))
        .send({})
        .expect(400);
      await request(server)
        .post(url)
        .set(auth(admin.token))
        .send({ reason: 'x' })
        .expect(403);
      const res = await request(server)
        .post(url)
        .set(auth(reception.token))
        .send({ reason: 'Se arrepintió' })
        .expect(200);
      expect(res.body.status).toBe('CANCELADA');
      expect(res.body.minutesLeft).toBeNull();
      await request(server)
        .post(url)
        .set(auth(reception.token))
        .send({ reason: 'otra vez' })
        .expect(409);
      await issue(r1, clinicA.doctor.token).expect(409);
    });

    it('cancelado el pedido, se puede registrar uno nuevo', async () => {
      const res = await createRequest(
        titular(patient.id, clinicA.professionalId),
      ).expect(201);
      r2 = res.body.id;
    });

    it('sin generar la copia no se puede marcar como entregada → 409', async () => {
      await request(server)
        .post(`${API}/doctor/history-exports/${r2}/deliver`)
        .set(auth(clinicA.doctor.token))
        .expect(409);
    });

    it('el médico debe confirmar la identidad de quien retira (400 si no)', async () => {
      await issue(r2, clinicA.doctor.token, {}).expect(400);
      await issue(r2, clinicA.doctor.token, {
        identityConfirmed: false,
      }).expect(400);
      expect((await row(r2)).status).toBe('PENDIENTE');
    });

    it('un médico que no es el asignado recibe 404; administración y recepción, 403', async () => {
      await issue(r2, clinicB.doctor.token).expect(404);
      await issue(r2, admin.token).expect(403);
      await issue(r2, reception.token).expect(403);
      expect((await row(r2)).status).toBe('PENDIENTE');
    });

    it('el médico asignado genera el PDF: descarga controlada, sin caché y con huellas guardadas', async () => {
      const res = await issue(r2, clinicA.doctor.token)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="historia-clinica-solicitud-\d+\.pdf"$/,
      );
      const body = res.body as Buffer;
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');

      const saved = await row(r2);
      expect(saved.status).toBe('EMITIDA');
      expect(saved.issue_count).toBe(1);
      expect(saved.issued_by_user_id).toBe(clinicA.doctor.userId);
      // solo las finalizadas: el borrador no entra
      expect(saved.consultations_count).toBe(2);
      expect(saved.pdf_hash).toBe(
        createHash('sha256').update(body).digest('hex'),
      );
      const hashes = (
        await dataSource.query(
          'SELECT content_hash FROM medical_consultations WHERE patient_id = ? AND status = ? ORDER BY started_at ASC, id ASC',
          [patient.id, 'FINALIZADA'],
        )
      ).map((c: any) => c.content_hash);
      expect(saved.chain_hash).toBe(computeChainHash(hashes));
    });

    it('la auditoría registra la emisión con huellas pero sin contenido clínico', async () => {
      const [log] = await audits('HISTORY_EXPORT_ISSUE', r2);
      expect(log.actorUserId).toBe(clinicA.doctor.userId);
      expect(log.patientId).toBe(patient.id);
      expect(log.metadata).toMatchObject({ consultations: 2, issueCount: 1 });
      const all = JSON.stringify(
        await dataSource.query(
          "SELECT * FROM audit_logs WHERE action LIKE 'HISTORY_EXPORT%' AND patient_id = ?",
          [patient.id],
        ),
      );
      for (const secret of [
        SECRET_REASON,
        SECRET_AMENDMENT,
        'Faringitis',
        'Ibuprofeno',
        'Hemograma',
      ]) {
        expect(all).not.toContain(secret);
      }
    });

    it('no se escribe nada en la carpeta de archivos subidos', () => {
      expect(listUploads()).toEqual(uploadsBefore);
    });

    it('se puede volver a generar mientras no se entregue (queda cada emisión)', async () => {
      await issue(r2, clinicA.doctor.token).expect(200);
      expect((await row(r2)).issue_count).toBe(2);
      expect(await audits('HISTORY_EXPORT_ISSUE', r2)).toHaveLength(2);
    });

    it('emitida la copia ya no se puede cancelar ni reasignar', async () => {
      await request(server)
        .post(`${API}/admin/history-exports/${r2}/cancel`)
        .set(auth(reception.token))
        .send({ reason: 'x' })
        .expect(409);
      await request(server)
        .patch(`${API}/admin/history-exports/${r2}/reassign`)
        .set(auth(admin.token))
        .send({ professionalId: clinicB.professionalId })
        .expect(409);
    });

    it('el médico confirma la entrega y el pedido se cierra', async () => {
      const res = await request(server)
        .post(`${API}/doctor/history-exports/${r2}/deliver`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(res.body.status).toBe('ENTREGADA');
      expect(res.body.minutesLeft).toBeNull();
      expect(res.body.deliveredAt).toBeTruthy();
      expect(await audits('HISTORY_EXPORT_DELIVER', r2)).toHaveLength(1);
      await request(server)
        .post(`${API}/doctor/history-exports/${r2}/deliver`)
        .set(auth(clinicA.doctor.token))
        .expect(409);
      await issue(r2, clinicA.doctor.token).expect(409);
    });

    it('un pedido entregado deja de contar en el resumen del médico', async () => {
      const mine = await request(server)
        .get(`${API}/doctor/history-exports/summary`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      expect(mine.body.open).toBe(0);
    });
  });

  describe('representante legal', () => {
    it('se registra quién retira y su vínculo', async () => {
      const patient = await patientWithHistory();
      const res = await createRequest({
        ...titular(patient.id, clinicA.professionalId),
        requesterType: 'REPRESENTANTE',
        requesterName: 'María Pérez',
        requesterDocument: '20111222',
        requesterRelationship: 'Madre',
      }).expect(201);
      expect(res.body).toMatchObject({
        requesterType: 'REPRESENTANTE',
        requesterName: 'María Pérez',
        requesterDocument: '20111222',
        requesterRelationship: 'Madre',
      });
    });

    it('si pide el titular no se guardan datos de representante', async () => {
      const patient = await patientWithHistory();
      const res = await createRequest({
        ...titular(patient.id, clinicA.professionalId),
        requesterName: 'Alguien',
      }).expect(201);
      expect(res.body.requesterName).toBeNull();
    });
  });

  describe('relación médico-paciente al emitir', () => {
    it('sin relación el médico recibe 403 y queda un intento DENIED en la auditoría', async () => {
      const patient = await newPatient();
      // pedido forzado en la base: por la API no se puede asignar a alguien sin relación
      const now = new Date();
      const inserted = await dataSource.query(
        `INSERT INTO history_export_requests
          (patient_id, requester_type, identity_checked, requested_by_user_id, assigned_professional_id, status, requested_at, due_at)
         VALUES (?, 'TITULAR', 1, ?, ?, 'PENDIENTE', ?, ?)`,
        [
          patient.id,
          reception.userId,
          clinicC.professionalId,
          now,
          new Date(now.getTime() + 48 * 3600_000),
        ],
      );
      const id = inserted.insertId as number;
      await issue(id, clinicC.doctor.token).expect(403);
      expect((await row(id)).status).toBe('PENDIENTE');
      const denied = await dataSource.getRepository(AuditLogEntity).exists({
        where: {
          actorUserId: clinicC.doctor.userId,
          patientId: patient.id,
          result: 'DENIED' as any,
        },
      });
      expect(denied).toBe(true);
    });
  });

  describe('plazo de 48 horas', () => {
    it('un pedido vencido se marca como tal y cuenta en el resumen', async () => {
      const patient = await patientWithHistory();
      const res = await createRequest(
        titular(patient.id, clinicA.professionalId),
      ).expect(201);
      expect(res.body.minutesLeft).toBeGreaterThan(47 * 60);
      const past = new Date(Date.now() - 3 * 24 * 3600_000);
      await dataSource.query(
        'UPDATE history_export_requests SET requested_at = ?, due_at = ? WHERE id = ?',
        [past, new Date(past.getTime() + 48 * 3600_000), res.body.id],
      );
      const list = await request(server)
        .get(`${API}/doctor/history-exports`)
        .set(auth(clinicA.doctor.token))
        .expect(200);
      const found = list.body.find((r: any) => r.id === res.body.id);
      expect(found.overdue).toBe(true);
      expect(found.minutesLeft).toBeLessThan(0);
      const summary = await request(server)
        .get(`${API}/admin/history-exports/summary`)
        .set(auth(admin.token))
        .expect(200);
      expect(summary.body.overdue).toBeGreaterThanOrEqual(1);
    });
  });

  describe('la base protege el trámite', () => {
    it('un pedido no se puede borrar (trigger)', async () => {
      const patient = await patientWithHistory();
      const res = await createRequest(
        titular(patient.id, clinicA.professionalId),
      ).expect(201);
      await expect(
        dataSource.query('DELETE FROM history_export_requests WHERE id = ?', [
          res.body.id,
        ]),
      ).rejects.toThrow(/no se eliminan/i);
    });

    it('el plazo y el estado tienen restricciones (CHECK)', async () => {
      const patient = await patientWithHistory();
      const res = await createRequest(
        titular(patient.id, clinicA.professionalId),
      ).expect(201);
      await expect(
        dataSource.query(
          "UPDATE history_export_requests SET status = 'EMITIDA' WHERE id = ?",
          [res.body.id],
        ),
      ).rejects.toThrow();
      await expect(
        dataSource.query(
          'UPDATE history_export_requests SET due_at = requested_at WHERE id = ?',
          [res.body.id],
        ),
      ).rejects.toThrow();
    });
  });

  describe('seguridad de los endpoints', () => {
    const routes: [string, string][] = [
      ['get', '/admin/history-exports'],
      ['get', '/admin/history-exports/summary'],
      ['get', '/admin/history-exports/candidates?patientId=1'],
      ['post', '/admin/history-exports'],
      ['post', '/admin/history-exports/1/cancel'],
      ['patch', '/admin/history-exports/1/reassign'],
      ['get', '/doctor/history-exports'],
      ['get', '/doctor/history-exports/summary'],
      ['post', '/doctor/history-exports/1/issue'],
      ['post', '/doctor/history-exports/1/deliver'],
    ];

    it.each(routes)('%s %s sin sesión → 401', async (method, path) => {
      await (request(server) as any)
        [method](`${API}${path}`)
        .send({})
        .expect(401);
    });

    it('los médicos no entran al lado administrativo; administración y recepción no entran al del médico', async () => {
      await request(server)
        .get(`${API}/admin/history-exports`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
      await request(server)
        .get(`${API}/admin/history-exports/summary`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
      for (const token of [admin.token, reception.token]) {
        await request(server)
          .get(`${API}/doctor/history-exports`)
          .set(auth(token))
          .expect(403);
        await request(server)
          .get(`${API}/doctor/history-exports/summary`)
          .set(auth(token))
          .expect(403);
        await request(server)
          .post(`${API}/doctor/history-exports/1/deliver`)
          .set(auth(token))
          .expect(403);
      }
      // los médicos ya quedaron afuera arriba; administración sí ve los candidatos (para reasignar)
      await request(server)
        .get(`${API}/admin/history-exports/candidates?patientId=1`)
        .set(auth(clinicA.doctor.token))
        .expect(403);
      await request(server)
        .get(`${API}/admin/history-exports/candidates?patientId=1`)
        .set(auth(admin.token))
        .expect(200);
    });

    it('ids inválidos → 400', async () => {
      await request(server)
        .post(`${API}/doctor/history-exports/abc/issue`)
        .set(auth(clinicA.doctor.token))
        .send({ identityConfirmed: true })
        .expect(400);
      await request(server)
        .get(`${API}/admin/history-exports/candidates?patientId=x`)
        .set(auth(reception.token))
        .expect(400);
    });

    it('pedido inexistente → 404 para el médico', async () => {
      await issue(999999999, clinicA.doctor.token).expect(404);
      await request(server)
        .post(`${API}/doctor/history-exports/999999999/deliver`)
        .set(auth(clinicA.doctor.token))
        .expect(404);
    });
  });
});
