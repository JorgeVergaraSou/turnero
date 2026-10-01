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
  unique,
  uniqueDni,
} from './e2e-helpers';
import { ClinicFixture, createClinic, patientData } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';
import {
  AppointmentEventPayload,
  AppointmentEvents,
} from '../src/appointments/appointment.events';

/**
 * Ataques DIRECTOS a la API pública de reserva, sin pasar por el
 * formulario: lo que haría alguien con curl/Postman o un script. Cada
 * caso documenta qué protección lo frena.
 *
 * El rate limiting (5 reservas / 10 min por IP) frenaría la mayoría de
 * estos pedidos antes de llegar a la validación, así que el contador se
 * reinicia antes de cada test; el propio límite se prueba aparte.
 */
describe('Seguridad de la reserva pública (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  let dataSource: DataSource;
  const today = clinicNow().date;
  const tomorrow = addDays(today, 1);
  const inThreeDays = addDays(today, 3);

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    app.get(getStorageToken()).storage.clear();
  });

  /** Cuerpo válido: cada ataque cambia UNA cosa sobre esto. */
  const validBody = (overrides: Record<string, unknown> = {}) => ({
    professionalId: clinic.professionalId,
    specialtyId: clinic.specialtyId,
    date: tomorrow,
    startTime: '10:00',
    patient: patientData(uniqueDni()),
    ...overrides,
  });

  const book = (body: unknown) =>
    request(server)
      .post(`${API}/public/appointments`)
      .send(body as object);

  const appointmentsOf = async (documentNumber: string) =>
    Number(
      (
        await dataSource.query(
          'SELECT COUNT(*) AS n FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE p.document_number = ?',
          [documentNumber],
        )
      )[0].n,
    );

  describe('campos que el formulario no manda (asignación masiva)', () => {
    it.each([
      ['status', { status: 'ATENDIDO' }],
      ['source', { source: 'RECEPCION' }],
      ['code', { code: 'AAAAAAAAAA' }],
      ['patientId', { patientId: 1 }],
      ['officeId', { officeId: 999 }],
      ['endTime', { endTime: '23:00' }],
      ['createdByUserId', { createdByUserId: 1 }],
      ['id', { id: 1 }],
    ])('rechaza "%s" y no crea el turno', async (_field, extra) => {
      const body = validBody(extra);
      await book(body).expect(400);
      expect(await appointmentsOf(body.patient.documentNumber)).toBe(0);
    });

    it.each([
      ['id', { id: 1 }],
      ['role', { role: 'ADMIN' }],
      ['notes', { notes: 'antecedentes' }],
    ])('rechaza "%s" dentro de los datos del paciente', async (_f, extra) => {
      const dni = uniqueDni();
      await book(
        validBody({ patient: { ...patientData(dni), ...extra } }),
      ).expect(400);
      expect(await appointmentsOf(dni)).toBe(0);
    });
  });

  describe('tipos y formatos inválidos', () => {
    it.each([
      ['professionalId con SQL', { professionalId: '1 OR 1=1' }],
      ['professionalId como array', { professionalId: [1, 2] }],
      ['professionalId como operador NoSQL', { professionalId: { $gt: 0 } }],
      ['professionalId negativo', { professionalId: -1 }],
      ['professionalId decimal', { professionalId: 1.5 }],
      ['fecha inexistente', { date: '2026-02-30' }],
      ['fecha con hora', { date: `${tomorrow}T10:00:00Z` }],
      ['fecha con SQL', { date: "'; DROP TABLE appointments;--" }],
      ['hora fuera de rango', { startTime: '25:00' }],
      ['hora con SQL', { startTime: '10:00 OR 1=1' }],
      ['sin paciente', { patient: undefined }],
      ['paciente como texto', { patient: 'Juan' }],
      ['paciente null', { patient: null }],
    ])('%s → 400', async (_name, override) => {
      await book(validBody(override)).expect(400);
    });

    it.each([
      ['DNI con SQL', { documentNumber: "1' OR '1'='1" }],
      ['DNI muy corto', { documentNumber: '123' }],
      ['teléfono con letras', { phone: 'llamame al fijo' }],
      ['email inválido', { email: 'no-es-un-email' }],
      [
        'email con inyección de cabeceras',
        { email: 'a@b.com\r\nBcc: x@y.com' },
      ],
      ['nombre de 81 caracteres', { firstName: 'a'.repeat(81) }],
      ['nombre con solo espacios', { firstName: '    ' }],
      ['nombre numérico', { firstName: 12345 }],
      ['nacimiento en el futuro', { birthDate: addDays(today, 10) }],
    ])('%s → 400', async (_name, override) => {
      await book(
        validBody({ patient: { ...patientData(uniqueDni()), ...override } }),
      ).expect(400);
    });

    it('JSON mal formado → 400 sin detalles internos', async () => {
      const res = await request(server)
        .post(`${API}/public/appointments`)
        .set('Content-Type', 'application/json')
        .send('{"professionalId": 1,,,')
        .expect(400);
      expect(JSON.stringify(res.body)).not.toMatch(
        /stack|at .*\.js|node_modules/i,
      );
    });

    it('cuerpo enorme (200 KB) → 413, no se procesa', async () => {
      await book(
        validBody({
          patient: {
            ...patientData(uniqueDni()),
            firstName: 'x'.repeat(200_000),
          },
        }),
      ).expect(413);
    });

    it('"__proto__" en el JSON no contamina objetos del servidor', async () => {
      const res = await request(server)
        .post(`${API}/public/appointments`)
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify(validBody()).replace(
            /^\{/,
            '{"__proto__":{"isAdmin":true},',
          ),
        );
      expect(res.status).toBeLessThan(500);
      expect(({} as any).isAdmin).toBeUndefined();
    });
  });

  describe('texto malicioso que SÍ pasa la validación', () => {
    it('SQL en el nombre se guarda como texto literal: no se ejecuta', async () => {
      const dni = uniqueDni();
      const booked = await book(
        validBody({
          startTime: '10:30',
          patient: {
            ...patientData(dni),
            firstName: "Robert'); DROP TABLE patients;--",
            lastName: "O'Brien",
          },
        }),
      ).expect(201);
      expect(booked.body.patientName).toBe(
        "Robert'); DROP TABLE patients;-- O.",
      );
      // la tabla sigue ahí y el paciente quedó con el texto tal cual
      const [row] = await dataSource.query(
        'SELECT first_name FROM patients WHERE document_number = ?',
        [dni],
      );
      expect(row.first_name).toBe("Robert'); DROP TABLE patients;--");
    });

    it('HTML/JS en el nombre vuelve como dato JSON, no como página', async () => {
      const booked = await book(
        validBody({
          startTime: '11:00',
          patient: {
            ...patientData(uniqueDni()),
            firstName: '<img src=x onerror=alert(1)>',
          },
        }),
      ).expect(201);
      expect(booked.headers['content-type']).toMatch(/application\/json/);
      expect(booked.body.patientName).toBe('<img src=x onerror=alert(1)> G.');
    });
  });

  describe('saltarse las reglas del turnero', () => {
    it('horario pasado → 400', async () => {
      await book(validBody({ date: addDays(today, -1) })).expect(400);
    });

    it('más allá del horizonte de reserva → 400', async () => {
      await book(validBody({ date: addDays(today, 400) })).expect(400);
    });

    it('hora fuera de la agenda (23:00) → 409', async () => {
      await book(validBody({ startTime: '23:00' })).expect(409);
    });

    it('hora desalineada con los turnos (10:15) → 409', async () => {
      await book(validBody({ startTime: '10:15' })).expect(409);
    });

    it('profesional inexistente → 404', async () => {
      await book(validBody({ professionalId: 999999 })).expect(404);
    });

    it('especialidad que el profesional no atiende → rechazado', async () => {
      const other = await request(server)
        .post(`${API}/admin/specialties`)
        .set(auth(admin.token))
        .send({ name: unique('Otra ') })
        .expect(201);
      const res = await book(validBody({ specialtyId: other.body.id }));
      expect([400, 404]).toContain(res.status);
    });

    it('con la reserva online deshabilitada → 403', async () => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send({ publicBookingEnabled: false })
        .expect(200);
      try {
        await book(validBody({ startTime: '12:00' })).expect(403);
      } finally {
        await request(server)
          .patch(`${API}/admin/settings`)
          .set(auth(admin.token))
          .send({ publicBookingEnabled: true })
          .expect(200);
      }
    });

    it('5 pedidos simultáneos al mismo horario → solo 1 lo obtiene', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          book(validBody({ date: inThreeDays, startTime: '09:00' })),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
    });
  });

  describe('suplantación: reservar con el DNI de otra persona', () => {
    it('no revela el nombre real ni toca el legajo', async () => {
      const dni = uniqueDni();
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send({
          firstName: 'María',
          lastName: 'Pérez',
          documentNumber: dni,
          phone: '11 4444-1111',
          healthInsuranceId: null,
          email: 'maria@example.com',
        })
        .expect(201);

      const emitted: AppointmentEventPayload[] = [];
      const events = app.get(EventEmitter2);
      const listener = (p: AppointmentEventPayload) => emitted.push(p);
      events.on(AppointmentEvents.CREATED, listener);

      const booked = await book(
        validBody({
          startTime: '13:00',
          patient: {
            firstName: 'Intruso',
            lastName: 'Curioso',
            documentNumber: dni,
            phone: '11 9999-9999',
            healthInsuranceId: null,
            email: 'intruso@example.com',
          },
        }),
      ).expect(201);
      events.off(AppointmentEvents.CREATED, listener);

      // ni la respuesta, ni la consulta posterior, ni el email (que va a la
      // dirección del intruso) muestran el nombre del legajo
      expect(booked.body.patientName).toBe('Intruso C.');
      const lookup = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code: booked.body.code, documentNumber: dni })
        .expect(200);
      expect(lookup.body.patientName).toBe('Intruso C.');
      const payload = emitted.find((p) => p.code === booked.body.code);
      expect(payload?.patientFirstName).toBe('Intruso');
      expect(payload?.contactEmail).toBe('intruso@example.com');
      expect(JSON.stringify([booked.body, lookup.body])).not.toMatch(
        /María|Pérez|maria@|4444-1111/,
      );

      // el legajo queda intacto: los datos del intruso quedan solo en el
      // turno (contacto), a la vista de recepción
      const [patient] = await dataSource.query(
        'SELECT first_name, last_name, phone, email FROM patients WHERE document_number = ?',
        [dni],
      );
      expect(patient).toEqual({
        first_name: 'María',
        last_name: 'Pérez',
        phone: '11 4444-1111',
        email: 'maria@example.com',
      });
    });
  });

  describe('salvaguardas de la reserva con DNI existente', () => {
    const registerPatient = async (dni: string) =>
      (
        await request(server)
          .post(`${API}/admin/patients`)
          .set(auth(reception.token))
          .send({
            firstName: 'Ana',
            lastName: 'Gómez',
            documentNumber: dni,
            phone: '11 4444-2222',
            healthInsuranceId: null,
            email: 'ana@example.com',
          })
          .expect(201)
      ).body;

    const captureNotices = () => {
      const emitted: AppointmentEventPayload[] = [];
      const listener = (p: AppointmentEventPayload) => emitted.push(p);
      app.get(EventEmitter2).on(AppointmentEvents.IDENTITY_NOTICE, listener);
      return {
        emitted,
        stop: () =>
          app
            .get(EventEmitter2)
            .off(AppointmentEvents.IDENTITY_NOTICE, listener),
      };
    };

    it('tope de turnos pendientes por DNI (2 por defecto); recepción no tiene tope', async () => {
      const dni = uniqueDni();
      const patient = patientData(dni);
      await book(validBody({ startTime: '16:00', patient })).expect(201);
      await book(validBody({ startTime: '16:30', patient })).expect(201);
      const third = await book(
        validBody({ startTime: '17:00', patient }),
      ).expect(409);
      expect(third.body.message).toMatch(/Ya hay 2 turnos pendientes/);

      const [{ id }] = await dataSource.query(
        'SELECT id FROM patients WHERE document_number = ?',
        [dni],
      );
      await request(server)
        .post(`${API}/admin/appointments`)
        .set(auth(reception.token))
        .send({
          professionalId: clinic.professionalId,
          specialtyId: clinic.specialtyId,
          patientId: id,
          date: tomorrow,
          startTime: '17:00',
        })
        .expect(201);
    });

    it('datos distintos al legajo: alerta para recepción y aviso al email DEL LEGAJO', async () => {
      const dni = uniqueDni();
      await registerPatient(dni);
      const notices = captureNotices();
      const booked = await book(
        validBody({
          startTime: '18:00',
          patient: {
            firstName: 'Intruso',
            lastName: 'Curioso',
            documentNumber: dni,
            phone: '11 9999-8888',
            healthInsuranceId: null,
            email: 'intruso@example.com',
          },
        }),
      ).expect(201);
      notices.stop();

      expect(notices.emitted).toHaveLength(1);
      expect(notices.emitted[0]).toMatchObject({
        code: booked.body.code,
        contactEmail: 'ana@example.com',
        patientFirstName: 'Ana',
      });

      const [{ id }] = await dataSource.query(
        'SELECT id FROM appointments WHERE code = ?',
        [booked.body.code],
      );
      const detail = await request(server)
        .get(`${API}/admin/appointments/${id}`)
        .set(auth(reception.token))
        .expect(200);
      expect(detail.body.contactMismatch).toEqual(['name', 'phone', 'email']);
      expect(detail.body.contactFirstName).toBe('Intruso');
      expect(detail.body.patient.firstName).toBe('Ana');
    });

    it('el mismo paciente escribiendo distinto (tildes, prefijo) no dispara nada', async () => {
      const dni = uniqueDni();
      await registerPatient(dni);
      const notices = captureNotices();
      const booked = await book(
        validBody({
          startTime: '18:30',
          patient: {
            firstName: 'ana',
            lastName: 'GOMEZ',
            documentNumber: dni,
            phone: '+54 9 11 4444 2222',
            healthInsuranceId: null,
          },
        }),
      ).expect(201);
      notices.stop();
      expect(notices.emitted).toHaveLength(0);

      const [{ id }] = await dataSource.query(
        'SELECT id FROM appointments WHERE code = ?',
        [booked.body.code],
      );
      const detail = await request(server)
        .get(`${API}/admin/appointments/${id}`)
        .set(auth(reception.token))
        .expect(200);
      expect(detail.body.contactMismatch).toEqual([]);
    });
  });

  describe('obra social', () => {
    let osde: number;
    let swiss: number;
    let inactive: number;

    const createInsurance = async (name: string) =>
      (
        await request(server)
          .post(`${API}/admin/health-insurances`)
          .set(auth(admin.token))
          .send({ name })
          .expect(201)
      ).body.id as number;

    beforeAll(async () => {
      osde = await createInsurance(unique('OS A '));
      swiss = await createInsurance(unique('OS B '));
      inactive = await createInsurance(unique('OS baja '));
      await request(server)
        .patch(`${API}/admin/health-insurances/${inactive}`)
        .set(auth(admin.token))
        .send({ active: false })
        .expect(200);
    });

    it('el catálogo público lista solo las activas, sin datos internos', async () => {
      const res = await request(server)
        .get(`${API}/public/health-insurances`)
        .expect(200);
      const ids = res.body.map((h: { id: number }) => h.id);
      expect(ids).toEqual(expect.arrayContaining([osde, swiss]));
      expect(ids).not.toContain(inactive);
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
    });

    it('recepción lee el catálogo pero no lo modifica; sin login, nada', async () => {
      await request(server)
        .get(`${API}/admin/health-insurances`)
        .set(auth(reception.token))
        .expect(200);
      await request(server)
        .post(`${API}/admin/health-insurances`)
        .set(auth(reception.token))
        .send({ name: unique('OS X ') })
        .expect(403);
      await request(server)
        .post(`${API}/admin/health-insurances`)
        .send({ name: unique('OS X ') })
        .expect(401);
    });

    it.each([
      ['sin obra social (falta el campo)', undefined],
      ['obra social inexistente', 999999],
      ['obra social desactivada', 'inactive'],
      ['obra social como texto', 'OSDE'],
    ])('reserva con %s → 400', async (_name, value) => {
      const dni = uniqueDni();
      const patient: Record<string, unknown> = { ...patientData(dni) };
      if (value === undefined) delete patient.healthInsuranceId;
      else patient.healthInsuranceId = value === 'inactive' ? inactive : value;
      await book(validBody({ startTime: '19:00', patient })).expect(400);
      expect(await appointmentsOf(dni)).toBe(0);
    });

    it('paciente nuevo: la obra social declarada queda en el legajo', async () => {
      const dni = uniqueDni();
      await book(
        validBody({
          startTime: '19:30',
          patient: { ...patientData(dni), healthInsuranceId: osde },
        }),
      ).expect(201);
      const [row] = await dataSource.query(
        'SELECT health_insurance_id AS hi FROM patients WHERE document_number = ?',
        [dni],
      );
      expect(row.hi).toBe(osde);
    });

    it('DNI existente con otra obra social: alerta, y el legajo no cambia', async () => {
      const dni = uniqueDni();
      await request(server)
        .post(`${API}/admin/patients`)
        .set(auth(reception.token))
        .send({ ...patientData(dni), healthInsuranceId: osde })
        .expect(201);

      const detailOf = async (code: string) => {
        const [{ id }] = await dataSource.query(
          'SELECT id FROM appointments WHERE code = ?',
          [code],
        );
        return (
          await request(server)
            .get(`${API}/admin/appointments/${id}`)
            .set(auth(reception.token))
            .expect(200)
        ).body;
      };

      // misma obra social y mismos datos: nada que marcar
      const same = await book(
        validBody({
          startTime: '20:00',
          patient: { ...patientData(dni), healthInsuranceId: osde },
        }),
      ).expect(201);
      expect((await detailOf(same.body.code)).contactMismatch).toEqual([]);

      // mismo nombre y teléfono pero otra obra social
      const other = await book(
        validBody({
          date: inThreeDays,
          startTime: '20:00',
          patient: { ...patientData(dni), healthInsuranceId: swiss },
        }),
      ).expect(201);
      const detail = await detailOf(other.body.code);
      expect(detail.contactMismatch).toEqual(['healthInsurance']);
      expect(detail.contactHealthInsurance.id).toBe(swiss);
      expect(detail.patient.healthInsurance.id).toBe(osde);

      const [row] = await dataSource.query(
        'SELECT health_insurance_id AS hi FROM patients WHERE document_number = ?',
        [dni],
      );
      expect(row.hi).toBe(osde);
    });

    describe('número de afiliado (opcional)', () => {
      const detailOf = async (code: string) => {
        const [{ id }] = await dataSource.query(
          'SELECT id FROM appointments WHERE code = ?',
          [code],
        );
        return (
          await request(server)
            .get(`${API}/admin/appointments/${id}`)
            .set(auth(reception.token))
            .expect(200)
        ).body;
      };
      const legajo = async (dni: string) =>
        (
          await dataSource.query(
            'SELECT id, health_insurance_id AS hi, health_insurance_number AS num FROM patients WHERE document_number = ?',
            [dni],
          )
        )[0];

      it('paciente nuevo: queda en el legajo; con "Particular" se descarta', async () => {
        const withOs = uniqueDni();
        await book(
          validBody({
            startTime: '20:30',
            patient: {
              ...patientData(withOs),
              healthInsuranceId: osde,
              healthInsuranceNumber: ' 61 123456 7/01 ',
            },
          }),
        ).expect(201);
        expect((await legajo(withOs)).num).toBe('61 123456 7/01');

        const particular = uniqueDni();
        await book(
          validBody({
            startTime: '21:00',
            patient: {
              ...patientData(particular),
              healthInsuranceNumber: '999999',
            },
          }),
        ).expect(201);
        expect((await legajo(particular)).num).toBeNull();
      });

      it.each([
        ['con HTML', '<script>'],
        ['muy corto', '1'],
        ['numérico en vez de texto', 123456],
      ])('número de afiliado %s → 400', async (_n, value) => {
        await book(
          validBody({
            startTime: '21:30',
            patient: {
              ...patientData(uniqueDni()),
              healthInsuranceId: osde,
              healthInsuranceNumber: value,
            },
          }),
        ).expect(400);
      });

      it('legajo con número: mismo número escrito distinto no alerta; otro número sí', async () => {
        const dni = uniqueDni();
        await request(server)
          .post(`${API}/admin/patients`)
          .set(auth(reception.token))
          .send({
            ...patientData(dni),
            healthInsuranceId: osde,
            healthInsuranceNumber: '61-123456-7/01',
          })
          .expect(201);

        const same = await book(
          validBody({
            date: inThreeDays,
            startTime: '20:30',
            patient: {
              ...patientData(dni),
              healthInsuranceId: osde,
              healthInsuranceNumber: '61 1234567 01',
            },
          }),
        ).expect(201);
        expect((await detailOf(same.body.code)).contactMismatch).toEqual([]);

        const other = await book(
          validBody({
            date: inThreeDays,
            startTime: '21:00',
            patient: {
              ...patientData(dni),
              healthInsuranceId: osde,
              healthInsuranceNumber: '99 999999 9/99',
            },
          }),
        ).expect(201);
        const detail = await detailOf(other.body.code);
        expect(detail.contactMismatch).toEqual(['healthInsuranceNumber']);
        expect(detail.contactHealthInsuranceNumber).toBe('99 999999 9/99');
        expect(detail.patient.healthInsuranceNumber).toBe('61-123456-7/01');
        expect((await legajo(dni)).num).toBe('61-123456-7/01');
      });

      it('legajo sin número: el declarado queda en el turno para que recepción lo cargue', async () => {
        const dni = uniqueDni();
        await request(server)
          .post(`${API}/admin/patients`)
          .set(auth(reception.token))
          .send({ ...patientData(dni), healthInsuranceId: osde })
          .expect(201);
        const booked = await book(
          validBody({
            date: inThreeDays,
            startTime: '21:30',
            patient: {
              ...patientData(dni),
              healthInsuranceId: osde,
              healthInsuranceNumber: '61 555555 5/01',
            },
          }),
        ).expect(201);
        const detail = await detailOf(booked.body.code);
        expect(detail.contactMismatch).toEqual([]);
        expect(detail.contactHealthInsuranceNumber).toBe('61 555555 5/01');
        expect(detail.patient.healthInsuranceNumber).toBeNull();

        // recepción lo pasa al legajo; al cambiar a particular se borra
        const { id } = await legajo(dni);
        const updated = await request(server)
          .patch(`${API}/admin/patients/${id}`)
          .set(auth(reception.token))
          .send({ healthInsuranceNumber: '61 555555 5/01' })
          .expect(200);
        expect(updated.body.healthInsuranceNumber).toBe('61 555555 5/01');
        const particular = await request(server)
          .patch(`${API}/admin/patients/${id}`)
          .set(auth(reception.token))
          .send({ healthInsuranceId: null })
          .expect(200);
        expect(particular.body.healthInsuranceNumber).toBeNull();
      });
    });
  });

  describe('consultar / cancelar turnos ajenos', () => {
    let code: string;
    let dni: string;

    beforeAll(async () => {
      dni = uniqueDni();
      app.get(getStorageToken()).storage.clear();
      code = (
        await book(
          validBody({ startTime: '14:00', patient: patientData(dni) }),
        ).expect(201)
      ).body.code;
    });

    it('código válido + DNI equivocado responde IGUAL que un código inexistente', async () => {
      const wrongDni = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code, documentNumber: '99999999' });
      const noCode = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code: 'ZZZZZZZZZZ', documentNumber: dni });
      expect(wrongDni.status).toBe(404);
      expect(noCode.status).toBe(404);
      expect(wrongDni.body.message).toBe(noCode.body.message);
    });

    it('cancelar con DNI equivocado → 404 y el turno sigue reservado', async () => {
      await request(server)
        .post(`${API}/public/appointments/cancel`)
        .send({ code, documentNumber: '99999999' })
        .expect(404);
      const lookup = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code, documentNumber: dni })
        .expect(200);
      expect(lookup.body.status).toBe('RESERVADO');
    });

    it('los intentos fallidos quedan en la auditoría como DENIED', async () => {
      const [{ n }] = await dataSource.query(
        "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'APPOINTMENT_PUBLIC_LOOKUP' AND result = 'DENIED'",
      );
      expect(Number(n)).toBeGreaterThanOrEqual(2);
    });

    it('la respuesta pública no expone datos internos', async () => {
      const lookup = await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code, documentNumber: dni })
        .expect(200);
      expect(Object.keys(lookup.body).sort()).toEqual(
        [
          'code',
          'date',
          'endTime',
          'office',
          'patientName',
          'professional',
          'specialty',
          'startTime',
          'status',
        ].sort(),
      );
    });
  });

  describe('fuerza bruta (rate limiting por IP)', () => {
    it('reservas: el 6.º pedido en 10 min → 429, aunque sean inválidos', async () => {
      for (let i = 0; i < 5; i++) {
        await book({}).expect(400);
      }
      const blocked = await book(validBody({ startTime: '15:00' })).expect(429);
      expect(blocked.body.message).toMatch(/Demasiados intentos/);
    });

    it('adivinar códigos: el 11.º intento en 10 min → 429', async () => {
      for (let i = 0; i < 10; i++) {
        await request(server)
          .post(`${API}/public/appointments/lookup`)
          .send({ code: `AAAAAAAAA${i}`, documentNumber: '12345678' })
          .expect(404);
      }
      await request(server)
        .post(`${API}/public/appointments/lookup`)
        .send({ code: 'AAAAAAAAAB', documentNumber: '12345678' })
        .expect(429);
    });
  });

  describe('rutas del personal sin credenciales válidas', () => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsignedToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ idUser: 1, role: 'ADMIN' })}.`;

    it.each([
      ['get', '/admin/appointments'],
      ['get', '/admin/patients'],
      ['get', '/admin/audit-logs'],
      ['post', '/admin/appointments'],
      ['patch', '/admin/settings'],
    ] as const)(
      '%s %s → 401 sin token, con token falso o sin firma',
      async (method, path) => {
        await request(server)[method](`${API}${path}`).expect(401);
        await request(server)
          [method](`${API}${path}`)
          .set('Authorization', 'Bearer inventado')
          .expect(401);
        await request(server)
          [method](`${API}${path}`)
          .set('Authorization', `Bearer ${unsignedToken}`)
          .expect(401);
      },
    );
  });
});
