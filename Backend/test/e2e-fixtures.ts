import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { API, auth, createUserAndLogin, unique } from './e2e-helpers';

export interface ClinicFixture {
  specialtyId: number;
  officeId: number;
  professionalId: number;
  doctor: { userId: number; token: string };
}

/**
 * Crea (vía la API real, como lo haría un admin) una especialidad, un
 * consultorio y un médico con perfil profesional que atiende TODOS los
 * días de 06:00 a 22:00 en turnos de 30 min — así "mañana" siempre tiene
 * horarios libres, sin importar a qué hora corra el test.
 */
export async function createClinic(
  app: INestApplication,
  adminToken: string,
): Promise<ClinicFixture> {
  const server = app.getHttpServer();

  const specialty = await request(server)
    .post(`${API}/admin/specialties`)
    .set(auth(adminToken))
    .send({ name: unique('Esp ') })
    .expect(201);

  const office = await request(server)
    .post(`${API}/admin/offices`)
    .set(auth(adminToken))
    .send({ name: unique('Cons '), address: 'Calle Falsa 123' })
    .expect(201);

  const doctor = await createUserAndLogin(app, Role.MEDICO);
  const professional = await request(server)
    .post(`${API}/admin/professionals`)
    .set(auth(adminToken))
    .send({
      userId: doctor.userId,
      licenseNumber: unique('MP-'),
      specialtyIds: [specialty.body.id],
    })
    .expect(201);

  for (let weekday = 1; weekday <= 7; weekday++) {
    await request(server)
      .post(`${API}/admin/schedules`)
      .set(auth(adminToken))
      .send({
        professionalId: professional.body.id,
        officeId: office.body.id,
        weekday,
        startTime: '06:00',
        endTime: '22:00',
        slotMinutes: 30,
        validFrom: '2020-01-01',
      })
      .expect(201);
  }

  return {
    specialtyId: specialty.body.id,
    officeId: office.body.id,
    professionalId: professional.body.id,
    doctor,
  };
}

export function patientData(documentNumber: string) {
  return {
    firstName: 'Juan',
    lastName: 'González',
    documentNumber,
    phone: '11 5555-0000',
    healthInsuranceId: null as number | null,
  };
}
