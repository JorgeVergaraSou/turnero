/**
 * QA: zona horaria. El consultorio es de Argentina (UTC-3) pero un VPS suele
 * correr en UTC (el sistema operativo y MySQL). Las fechas que genera la base
 * (created_at, auditoría) tienen que seguir siendo las reales, sin importar la
 * zona del servidor: no se pueden ver 3 horas corridas en la auditoría ni
 * descontarle 3 horas a la regla de "reservado dentro de la ventana".
 *
 * Esta prueba compara cada fecha generada por la base con el reloj real.
 * Para provocar el escenario del VPS: TZ=UTC en el proceso de Node y
 *   SET GLOBAL time_zone = '+00:00'   en MySQL (volver a 'SYSTEM' después).
 */
import { INestApplication } from '@nestjs/common';
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
import { createClinic, patientData } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { AuditLogEntity } from '../src/audit/entities/audit-log.entity';
import { AuditAction } from '../src/audit/audit.enums';
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';

const TOLERANCE_MS = 2 * 60 * 1000;

describe('QA: zona horaria del servidor (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let reception: { userId: number; token: string };

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('la sesión de MySQL usa la hora del consultorio (UTC-3), sea cual sea la del servidor', async () => {
    const [row] = await dataSource.query('SELECT @@session.time_zone tz');
    expect(row.tz).toBe('-03:00');
  });

  it('una fecha generada por la base coincide con el reloj real (created_at del turno)', async () => {
    const clinic = await createClinic(app, admin.token);
    const patient = (
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send(patientData(uniqueDni()))
        .expect(201)
    ).body;
    const date = addDays(clinicNow().date, 3);
    const before = Date.now();
    const created = await request(server)
      .post(`${API}/admin/appointments`)
      .set(auth(reception.token))
      .send({
        professionalId: clinic.professionalId,
        specialtyId: clinic.specialtyId,
        patientId: patient.id,
        date,
        startTime: '10:00',
      })
      .expect(201);
    const createdAt = new Date(created.body.createdAt).getTime();
    expect(Math.abs(createdAt - before)).toBeLessThan(TOLERANCE_MS);
  });

  it('el registro de auditoría muestra la hora real', async () => {
    const before = Date.now();
    await request(server)
      .post(`${API}/admin/specialties`)
      .set(auth(admin.token))
      .send({ name: `QA hora ${before}` })
      .expect(201);
    // el registro de ESTE administrador (la base de pruebas acumula filas de
    // corridas anteriores, algunas con hora corrida a propósito)
    const last = await dataSource.getRepository(AuditLogEntity).findOneOrFail({
      where: {
        actorUserId: admin.userId,
        action: AuditAction.SPECIALTY_CREATE,
      },
      order: { id: 'DESC' },
    });
    expect(Math.abs(last.createdAt.getTime() - before)).toBeLessThan(
      TOLERANCE_MS,
    );
  });

  it('CURRENT_TIMESTAMP de la base coincide con el reloj real', async () => {
    const [row] = await dataSource.query('SELECT CURRENT_TIMESTAMP(3) AS now');
    expect(Math.abs(new Date(row.now).getTime() - Date.now())).toBeLessThan(
      TOLERANCE_MS,
    );
  });
});
