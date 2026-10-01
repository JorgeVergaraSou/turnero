import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
  unique,
  uniqueDni,
} from './e2e-helpers';
import { ClinicFixture, createClinic, patientData } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/users/entities/user.entity';

const DEFAULT_SETTINGS = {
  publicBookingEnabled: true,
  bookingHorizonDays: 90,
  publicCancelMinHours: 0,
};

describe('Administración: usuarios, auditoría y configuración (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };
  let clinic: ClinicFixture;
  const tomorrow = addDays(clinicNow().date, 1);

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  afterAll(async () => {
    // la configuración es global a la base de e2e: dejarla como estaba
    await request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send(DEFAULT_SETTINGS);
    await app.close();
  });

  const setSettings = (body: Record<string, unknown>) =>
    request(server)
      .patch(`${API}/admin/settings`)
      .set(auth(admin.token))
      .send(body)
      .expect(200);

  describe('gestión de usuarios', () => {
    it('el admin edita nombre y rol de otro usuario', async () => {
      const target = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await request(server)
        .patch(`${API}/auth/editar-usuario/${target.userId}`)
        .set(auth(admin.token))
        .send({ nombre: 'Editada', role: Role.ADMIN })
        .expect(200);

      const list = await request(server)
        .get(`${API}/auth/listar-usuarios`)
        .set(auth(admin.token))
        .expect(200);
      const edited = list.body.find((u: any) => u.idUser === target.userId);
      expect(edited).toMatchObject({ nombre: 'Editada', role: Role.ADMIN });
    });

    it('el cambio de rol rige en el próximo request, sin esperar a que venza el token', async () => {
      const target = await createUserAndLogin(app, Role.RECEPCIONISTA);
      await request(server)
        .get(`${API}/admin/patients`)
        .set(auth(target.token))
        .expect(200);

      await request(server)
        .patch(`${API}/auth/editar-usuario/${target.userId}`)
        .set(auth(admin.token))
        .send({ role: Role.MEDICO })
        .expect(200);

      // mismo token, rol nuevo: ya no es recepción
      await request(server)
        .get(`${API}/admin/patients`)
        .set(auth(target.token))
        .expect(403);
    });

    it('un MEDICO con perfil profesional activo no puede perder el rol (409)', async () => {
      await request(server)
        .patch(`${API}/auth/editar-usuario/${clinic.doctor.userId}`)
        .set(auth(admin.token))
        .send({ role: Role.RECEPCIONISTA })
        .expect(409);
    });

    it('el admin no puede cambiarse el rol ni darse de baja a sí mismo', async () => {
      await request(server)
        .patch(`${API}/auth/editar-usuario/${admin.userId}`)
        .set(auth(admin.token))
        .send({ role: Role.RECEPCIONISTA })
        .expect(400);
      await request(server)
        .delete(`${API}/auth/dar-de-baja-usuario/${admin.userId}`)
        .set(auth(admin.token))
        .expect(400);
    });

    it('restablecer clave: la nueva funciona y la anterior deja de funcionar', async () => {
      const dataSource = app.get(DataSource);
      const nickUsuario = unique('reset-');
      const saved = await dataSource.getRepository(UserEntity).save({
        nickUsuario,
        nombre: 'Clave',
        apellido: 'Vieja',
        password: await argon2.hash('ClaveVieja1'),
        role: Role.RECEPCIONISTA,
      });

      await request(server)
        .post(`${API}/auth/restablecer-clave/${saved.idUser}`)
        .set(auth(admin.token))
        .send({ password: 'ClaveNueva2' })
        .expect(201);

      await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario, password: 'ClaveVieja1' })
        .expect(401);
      await request(server)
        .post(`${API}/auth/login`)
        .send({ nickUsuario, password: 'ClaveNueva2' })
        .expect(200);
    });

    it('una recepcionista no puede editar usuarios ni restablecer claves', async () => {
      await request(server)
        .patch(`${API}/auth/editar-usuario/${admin.userId}`)
        .set(auth(reception.token))
        .send({ nombre: 'Hack' })
        .expect(403);
      await request(server)
        .post(`${API}/auth/restablecer-clave/${admin.userId}`)
        .set(auth(reception.token))
        .send({ password: 'ClaveNueva2' })
        .expect(403);
    });
  });

  describe('consulta de auditoría', () => {
    it('el admin ve los accesos clínicos denegados, con nombres de quién y de qué paciente', async () => {
      const patient = (
        await request(server)
          .post(`${API}/admin/patients`)
          .set(auth(reception.token))
          .send(patientData(uniqueDni()))
          .expect(201)
      ).body;
      // médico sin relación con el paciente → DENIED
      await request(server)
        .get(`${API}/doctor/patients/${patient.id}/clinical-history`)
        .set(auth(clinic.doctor.token))
        .expect(403);

      const res = await request(server)
        .get(`${API}/admin/audit-logs`)
        .query({
          category: 'CLINICAL',
          result: 'DENIED',
          patientId: patient.id,
        })
        .set(auth(admin.token))
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0]).toMatchObject({
        action: 'VIEW_CLINICAL_HISTORY',
        clinical: true,
        result: 'DENIED',
        actor: { id: clinic.doctor.userId, role: Role.MEDICO },
        patient: { id: patient.id, documentNumber: patient.documentNumber },
      });
      // nunca contenido clínico en la auditoría
      expect(JSON.stringify(res.body)).not.toMatch(/anamnesis|diagn/i);
    });

    it('recepción y médicos no pueden consultar la auditoría', async () => {
      await request(server)
        .get(`${API}/admin/audit-logs`)
        .set(auth(reception.token))
        .expect(403);
      await request(server)
        .get(`${API}/admin/audit-logs`)
        .set(auth(clinic.doctor.token))
        .expect(403);
    });
  });

  describe('configuración del consultorio', () => {
    it('es pública para leer y solo el admin la modifica', async () => {
      const res = await request(server)
        .get(`${API}/public/settings`)
        .expect(200);
      expect(res.body).toHaveProperty('clinicName');
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(reception.token))
        .send({ clinicName: 'No debería' })
        .expect(403);
    });

    it('con la reserva online deshabilitada, el paciente no puede reservar pero recepción sí', async () => {
      await setSettings({
        publicBookingEnabled: false,
        contactPhone: '11 4000-0000',
      });
      try {
        const res = await request(server)
          .post(`${API}/public/appointments`)
          .send({
            professionalId: clinic.professionalId,
            specialtyId: clinic.specialtyId,
            date: tomorrow,
            startTime: '07:00',
            patient: patientData(uniqueDni()),
          })
          .expect(403);
        expect(res.body.message).toMatch(/11 4000-0000/);

        const patient = (
          await request(server)
            .post(`${API}/admin/patients`)
            .set(auth(reception.token))
            .send(patientData(uniqueDni()))
            .expect(201)
        ).body;
        await request(server)
          .post(`${API}/admin/appointments`)
          .set(auth(reception.token))
          .send({
            professionalId: clinic.professionalId,
            specialtyId: clinic.specialtyId,
            patientId: patient.id,
            date: tomorrow,
            startTime: '07:00',
          })
          .expect(201);
      } finally {
        await setSettings({ publicBookingEnabled: true, contactPhone: null });
      }
    });

    it('el horizonte de reserva configurado limita disponibilidad y reservas', async () => {
      await setSettings({ bookingHorizonDays: 3 });
      try {
        const far = addDays(clinicNow().date, 10);
        const slots = await request(server)
          .get(
            `${API}/public/professionals/${clinic.professionalId}/availability`,
          )
          .query({ from: far, to: far })
          .expect(200);
        expect(slots.body).toEqual([]);

        const patient = (
          await request(server)
            .post(`${API}/admin/patients`)
            .set(auth(reception.token))
            .send(patientData(uniqueDni()))
            .expect(201)
        ).body;
        const res = await request(server)
          .post(`${API}/admin/appointments`)
          .set(auth(reception.token))
          .send({
            professionalId: clinic.professionalId,
            specialtyId: clinic.specialtyId,
            patientId: patient.id,
            date: far,
            startTime: '10:00',
          })
          .expect(400);
        expect(res.body.message).toMatch(/3 días/);
      } finally {
        await setSettings({ bookingHorizonDays: 90 });
      }
    });

    it('la anticipación mínima impide cancelar online sobre la hora, pero no a recepción', async () => {
      const dni = uniqueDni();
      const booked = await request(server)
        .post(`${API}/public/appointments`)
        .send({
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          date: tomorrow,
          startTime: '07:30',
          patient: patientData(dni),
        })
        .expect(201);

      // 168 h = 7 días: un turno de mañana siempre queda dentro del límite
      await setSettings({ publicCancelMinHours: 168 });
      try {
        const res = await request(server)
          .post(`${API}/public/appointments/cancel`)
          .send({ code: booked.body.code, documentNumber: dni })
          .expect(409);
        expect(res.body.message).toMatch(/168 h/);
      } finally {
        await setSettings({ publicCancelMinHours: 0 });
      }

      await request(server)
        .post(`${API}/public/appointments/cancel`)
        .send({ code: booked.body.code, documentNumber: dni })
        .expect(200);
    });

    it('rechaza valores fuera de rango', async () => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ bookingHorizonDays: 0 })
        .expect(400);
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ publicCancelMinHours: 500 })
        .expect(400);
    });
  });
});
