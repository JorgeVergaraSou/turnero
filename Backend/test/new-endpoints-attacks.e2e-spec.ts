/**
 * Catálogo de ataques (guia-seguridad-endpoints.md, paso 3) sobre los
 * endpoints que se agregaron después de la primera auditoría: pantallas de
 * sala (administración, token y stream), llamado de pacientes y la
 * configuración del llamado. Se ataca como con curl: campos de más, tipos
 * raros, ids inventados, el token en lugares donde no debe valer y cuerpos
 * gigantes. Regla de oro: nunca 500, y nada de 2xx donde se espera rechazo.
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
  unique,
} from './e2e-helpers';
import { ClinicFixture, createClinic } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';

describe('Ataques a los endpoints nuevos (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;
  let admin: { userId: number; token: string };
  let clinic: ClinicFixture;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    admin = await createUserAndLogin(app, Role.ADMIN);
    clinic = await createClinic(app, admin.token);
  }, 120000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    await app.close();
  });

  const createDevice = async (name = unique('TV ')) =>
    (
      await request(server)
        .post(`${API}/admin/display-devices`)
        .set(auth(admin.token))
        .send({ name })
        .expect(201)
    ).body as { id: number; name: string; token: string };

  const deviceCount = async () =>
    Number(
      (await dataSource.query('SELECT COUNT(*) AS n FROM display_devices'))[0]
        .n,
    );

  describe('asignación masiva (campos que el formulario no manda)', () => {
    it.each([
      ['tokenHash', { tokenHash: 'a'.repeat(64) }],
      ['tokenEncrypted', { tokenEncrypted: 'x.y.z' }],
      ['token', { token: `dsp_${'a'.repeat(43)}` }],
      ['id', { id: 1 }],
      ['active', { active: false }],
      ['lastSeenAt', { lastSeenAt: '2020-01-01' }],
      ['createdAt', { createdAt: '2020-01-01' }],
      ['anidado', { device: { id: 1 } }],
    ])(
      'crear pantalla con "%s" de más → 400 y nada guardado',
      async (_c, extra) => {
        const before = await deviceCount();
        await request(server)
          .post(`${API}/admin/display-devices`)
          .set(auth(admin.token))
          .send({ name: unique('X '), ...extra })
          .expect(400);
        expect(await deviceCount()).toBe(before);
      },
    );

    it.each([
      ['tokenHash', { tokenHash: 'b'.repeat(64) }],
      ['tokenEncrypted', { tokenEncrypted: 'x.y.z' }],
      ['token', { token: `dsp_${'b'.repeat(43)}` }],
      ['id', { id: 999 }],
      ['lastSeenAt', { lastSeenAt: '2020-01-01' }],
      ['createdAt', { createdAt: '2020-01-01' }],
    ])(
      'editar pantalla con "%s" de más → 400 y la pantalla no cambia',
      async (_c, extra) => {
        const device = await createDevice();
        const [before] = await dataSource.query(
          'SELECT * FROM display_devices WHERE id = ?',
          [device.id],
        );
        await request(server)
          .patch(`${API}/admin/display-devices/${device.id}`)
          .set(auth(admin.token))
          .send({ name: 'Otro nombre', ...extra })
          .expect(400);
        const [after] = await dataSource.query(
          'SELECT * FROM display_devices WHERE id = ?',
          [device.id],
        );
        expect(after).toEqual(before);
      },
    );

    it.each([
      ['id', { id: 2 }],
      ['updatedByUserId', { updatedByUserId: 1 }],
      ['updatedAt', { updatedAt: '2020-01-01' }],
      [
        'clinicName vacío junto a un campo inventado',
        { clinicName: 'X', admin: true },
      ],
    ])('configuración con "%s" de más → 400', async (_c, extra) => {
      await request(server)
        .patch(`${API}/admin/settings`)
        .set(auth(admin.token))
        .send(extra)
        .expect(400);
    });
  });

  describe('tipos y formatos inesperados', () => {
    it.each([
      ['active como texto', { active: 'true' }],
      ['active como número', { active: 1 }],
      ['active como array', { active: [true] }],
      ['name como objeto', { name: { $gt: '' } }],
      ['name como array', { name: ['a'] }],
      ['name enorme', { name: 'x'.repeat(100000) }],
    ])('editar pantalla con %s → 400 (nunca 500)', async (_c, body) => {
      const device = await createDevice();
      const res = await request(server)
        .patch(`${API}/admin/display-devices/${device.id}`)
        .set(auth(admin.token))
        .send(body);
      expect(res.status).toBe(400);
    });

    it('el nombre con HTML o SQL se guarda como texto literal y la tabla sigue existiendo', async () => {
      for (const name of [
        `<img src=x onerror=alert(1)> ${unique()}`,
        `'; DROP TABLE display_devices;-- ${unique()}`,
      ]) {
        const res = await request(server)
          .post(`${API}/admin/display-devices`)
          .set(auth(admin.token))
          .send({ name })
          .expect(201);
        expect(res.body.name).toBe(name);
      }
      expect(await deviceCount()).toBeGreaterThan(0);
    });

    it.each([
      ['texto plano', 'text/plain', 'name=algo'],
      ['XML', 'application/xml', '<name>x</name>'],
      [
        'formulario con campo de más',
        'application/x-www-form-urlencoded',
        'name=x&tokenHash=1',
      ],
      ['JSON roto', 'application/json', '{"name":'],
    ])('crear pantalla con cuerpo %s → 400', async (_c, type, body) => {
      const before = await deviceCount();
      const res = await request(server)
        .post(`${API}/admin/display-devices`)
        .set(auth(admin.token))
        .set('Content-Type', type)
        .send(body);
      expect(res.status).toBe(400);
      expect(await deviceCount()).toBe(before);
    });

    it('un cuerpo de 1 MB → 413, no 500', async () => {
      const res = await request(server)
        .post(`${API}/admin/display-devices`)
        .set(auth(admin.token))
        .send({ name: 'x'.repeat(1_000_000) });
      expect(res.status).toBe(413);
    });
  });

  describe('ids inventados en la URL (nunca 500, nunca 2xx)', () => {
    const BAD_IDS = [
      'abc',
      '1.5',
      '-1',
      '0',
      '99999999999999999999',
      encodeURIComponent('1 OR 1=1'),
      encodeURIComponent("1'; DROP TABLE users;--"),
      '%00',
      encodeURIComponent('[1,2]'),
      encodeURIComponent('{"$gt":0}'),
    ];

    it.each(BAD_IDS)('pantallas con id "%s" → 400 o 404', async (id) => {
      const calls: Array<() => request.Test> = [
        () =>
          request(server)
            .patch(`${API}/admin/display-devices/${id}`)
            .send({ active: true }),
        () =>
          request(server).post(
            `${API}/admin/display-devices/${id}/rotate-token`,
          ),
        () => request(server).get(`${API}/admin/display-devices/${id}/token`),
      ];
      for (const call of calls) {
        const res = await call().set(auth(admin.token));
        expect([400, 404]).toContain(res.status);
      }
    });

    it.each(BAD_IDS)('llamar con id de turno "%s" → 400 o 404', async (id) => {
      const res = await request(server)
        .post(`${API}/doctor/appointments/${id}/call`)
        .set(auth(clinic.doctor.token));
      expect([400, 404]).toContain(res.status);
    });

    it('el llamado ignora campos en el cuerpo (no hay nada que asignar) y no rompe', async () => {
      const res = await request(server)
        .post(`${API}/doctor/appointments/999999/call`)
        .set(auth(clinic.doctor.token))
        .send({
          officeId: 1,
          calledByUserId: 1,
          callNumber: 99,
          role: 'ADMIN',
        });
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('el token de pantalla solo vale por cabecera, en el stream', () => {
    const FORMS: Array<[string, (token: string) => request.Test]> = [
      [
        'en la URL (?token=)',
        (t) => request(server).get(`${API}/display/stream?token=${t}`),
      ],
      [
        'en la URL (?access_token=)',
        (t) => request(server).get(`${API}/display/stream?access_token=${t}`),
      ],
      [
        'en una cookie',
        (t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set('Cookie', `token=${t}`),
      ],
      [
        'en otra cabecera (X-Display-Token)',
        (t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set('X-Display-Token', t),
      ],
      [
        'con Basic en vez de Bearer',
        (t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set(
              'Authorization',
              `Basic ${Buffer.from(`x:${t}`).toString('base64')}`,
            ),
      ],
      [
        'sin la palabra Bearer',
        (t) =>
          request(server).get(`${API}/display/stream`).set('Authorization', t),
      ],
      [
        'con dos espacios',
        (t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set('Authorization', `Bearer  ${t}`),
      ],
      [
        'con el token dos veces',
        (t) =>
          request(server)
            .get(`${API}/display/stream`)
            .set('Authorization', `Bearer ${t} ${t}`),
      ],
    ];

    it.each(FORMS)('un token VÁLIDO %s → 401', async (_forma, send) => {
      const { token } = await createDevice();
      const res = await send(token);
      expect(res.status).toBe(401);
    });

    it.each([
      ['POST', 'post'],
      ['PUT', 'put'],
      ['PATCH', 'patch'],
      ['DELETE', 'delete'],
    ] as const)(
      '%s al stream no está permitido (nunca 2xx)',
      async (_m, method) => {
        const { token } = await createDevice();
        const res = await request(server)
          [method](`${API}/display/stream`)
          .set(auth(token));
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      },
    );

    it('el token de una pantalla desactivada o rotada no sirve ni en el stream ni para ver el token', async () => {
      const device = await createDevice();
      await request(server)
        .patch(`${API}/admin/display-devices/${device.id}`)
        .set(auth(admin.token))
        .send({ active: false })
        .expect(200);
      expect(
        (
          await request(server)
            .get(`${API}/display/stream`)
            .set(auth(device.token))
        ).status,
      ).toBe(401);
      // el token de pantalla tampoco abre la administración
      await request(server)
        .get(`${API}/admin/display-devices/${device.id}/token`)
        .set(auth(device.token))
        .expect(401);
    });
  });

  describe('filtración de información', () => {
    it('ninguna respuesta de pantallas trae el hash ni el token guardado cifrado', async () => {
      const device = await createDevice();
      const bodies = [
        (
          await request(server)
            .get(`${API}/admin/display-devices`)
            .set(auth(admin.token))
        ).text,
        JSON.stringify(
          (
            await request(server)
              .patch(`${API}/admin/display-devices/${device.id}`)
              .set(auth(admin.token))
              .send({ name: unique('Renombrada ') })
          ).body,
        ),
      ];
      const [row] = await dataSource.query(
        'SELECT token_hash, token_encrypted FROM display_devices WHERE id = ?',
        [device.id],
      );
      for (const body of bodies) {
        expect(body).not.toContain(row.token_hash);
        expect(body).not.toContain(row.token_encrypted);
        expect(body).not.toContain(device.token);
      }
    });

    it('los errores de pantallas y llamados no muestran SQL ni rutas internas', async () => {
      const probes = await Promise.all([
        request(server)
          .patch(`${API}/admin/display-devices/99999999999999999999`)
          .set(auth(admin.token))
          .send({}),
        request(server)
          .get(`${API}/admin/display-devices/abc/token`)
          .set(auth(admin.token)),
        request(server)
          .post(`${API}/doctor/appointments/99999999999999999999/call`)
          .set(auth(clinic.doctor.token)),
      ]);
      for (const res of probes) {
        expect(JSON.stringify(res.body)).not.toMatch(
          /SELECT|INSERT|UPDATE |ER_|QueryFailed|node_modules|at .*\.ts|C:\\/i,
        );
      }
    });
  });
});
