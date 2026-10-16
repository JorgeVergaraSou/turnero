/**
 * QA: regresiones de los errores 500 que encontró el fuzzing. Cada caso es una
 * petición real que antes devolvía 500.
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
  prepareE2eDatabase,
} from './e2e-helpers';
import { ClinicFixture, createClinic } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { AuditService } from '../src/audit/audit.service';
import { AuditAction } from '../src/audit/audit.enums';

describe('QA: regresiones del fuzzing (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinic: ClinicFixture;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await app.close();
  });

  describe('ids imposibles en la URL: nunca 500', () => {
    const IMPOSSIBLE = ['-1', '0', '99999999999999999999', '4294967296'];

    it.each(IMPOSSIBLE)(
      'paciente %s (médico, ficha e historia) → 404',
      async (id) => {
        for (const path of [
          `/doctor/patients/${id}`,
          `/doctor/patients/${id}/clinical-history`,
        ]) {
          await request(server)
            .get(`${API}${path}`)
            .set(auth(clinic.doctor.token))
            .expect(404);
        }
      },
    );

    it.each(IMPOSSIBLE)(
      '%s en rutas de administración y recepción → 404',
      async (id) => {
        await request(server)
          .get(`${API}/admin/patients/${id}`)
          .set(auth(reception.token))
          .expect(404);
        await request(server)
          .get(`${API}/admin/appointments/${id}`)
          .set(auth(reception.token))
          .expect(404);
        await request(server)
          .patch(`${API}/admin/professionals/${id}`)
          .set(auth(admin.token))
          .send({})
          .expect(404);
      },
    );

    it('un id que no es número → 400 con mensaje en castellano', async () => {
      const res = await request(server)
        .get(`${API}/doctor/patients/abc`)
        .set(auth(clinic.doctor.token))
        .expect(400);
      expect(res.body.message).toBe('El identificador no es válido.');
    });

    it('un id válido que no existe sigue dando el 403 de siempre (no revela si existe)', async () => {
      await request(server)
        .get(`${API}/doctor/patients/2000000000`)
        .set(auth(clinic.doctor.token))
        .expect(403);
    });
  });

  describe('la auditoría no tira la operación por un id imposible', () => {
    it('registrar un paciente fuera de rango no falla: se guarda sin paciente', async () => {
      const audit = app.get(AuditService);
      const actor = { userId: admin.userId, ip: '127.0.0.1' };
      for (const patientId of [99999999999999999999, -1, 0, 1.5, NaN]) {
        await expect(
          audit.record({
            actor,
            action: AuditAction.VIEW_PATIENT,
            resourceType: 'patient',
            resourceId: 'x',
            patientId,
          }),
        ).resolves.toBeUndefined();
      }
      const rows = await dataSource.query(
        "SELECT patient_id FROM audit_logs WHERE actor_user_id=? AND action='VIEW_PATIENT' ORDER BY id DESC LIMIT 5",
        [admin.userId],
      );
      expect(rows.map((r: any) => r.patient_id)).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
    });
  });

  describe('cuerpo que es una lista donde se espera un objeto → 400', () => {
    it('PATCH /admin/settings con []', async () => {
      const res = await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send([])
        .expect(400);
      expect(res.body.message).toBe(
        'El cuerpo del pedido tiene que ser un objeto.',
      );
    });

    it('PATCH /auth/editar-usuario/:id con []', async () => {
      await request(server)
        .patch(`${API}/auth/editar-usuario/${admin.userId}`)
        .set(auth(admin.token))
        .send([])
        .expect(400);
    });

    it('en los endpoints públicos también', async () => {
      await request(server)
        .post(`${API}/public/appointments`)
        .send([])
        .expect(400);
      await request(server).post(`${API}/auth/login`).send([]).expect(400);
    });

    it('un objeto vacío sigue siendo válido donde todo es opcional', async () => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({})
        .expect(200);
    });
  });

  describe('las respuestas de la API no se guardan en cachés', () => {
    it.each([
      ['pública', () => request(server).get(`${API}/public/settings`)],
      [
        'de recepción',
        () =>
          request(server)
            .get(`${API}/admin/patients`)
            .set(auth(reception.token)),
      ],
      ['de error 401', () => request(server).get(`${API}/admin/patients`)],
      ['de error 404', () => request(server).get(`${API}/ruta/que/no/existe`)],
    ])('respuesta %s → Cache-Control: no-store', async (_c, send) => {
      const res = await send();
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    it('el stream de eventos conserva su propia política', async () => {
      const res = await request(server)
        .get(`${API}/doctor/agenda/stream`)
        .set(auth(clinic.doctor.token))
        .buffer(false)
        .parse((r: any, cb: any) => {
          r.destroy();
          cb(null, {});
        });
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    });
  });

  describe('mensajes de validación en castellano', () => {
    it('un texto demasiado largo avisa en castellano y sin la ruta interna', async () => {
      const res = await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send({
          firstName: 'A',
          lastName: 'X'.repeat(200),
          documentNumber: '12345678',
          phone: '1155550000',
          healthInsuranceId: null,
        })
        .expect(400);
      const text = JSON.stringify(res.body.message);
      expect(text).toContain('El apellido admite hasta 80 caracteres.');
      expect(text).not.toMatch(/must be|should not|lastName/);
    });

    it('un campo que sobra se informa en castellano', async () => {
      const res = await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ campoInventado: 1 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        '«campoInventado» no se admite',
      );
    });

    it('los mensajes de objetos anidados no llevan el prefijo "patient."', async () => {
      const res = await request(server)
        .post(`${API}/public/appointments`)
        .send({
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          date: '2099-01-01',
          startTime: '09:00',
          privacyVersion: 1,
          patient: {
            firstName: 'A',
            lastName: 'B',
            documentNumber: '1',
            phone: 'abc',
            healthInsuranceId: null,
          },
        })
        .expect(400);
      const messages: string[] = res.body.message;
      expect(messages.some((m) => m.startsWith('patient.'))).toBe(false);
      expect(messages).toContain(
        'El DNI debe tener entre 5 y 20 letras o números.',
      );
    });
  });
});
