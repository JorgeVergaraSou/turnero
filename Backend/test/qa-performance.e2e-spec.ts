/**
 * QA: lectura y rendimiento con volumen. Mide los tiempos de las consultas más
 * usadas sobre una base con miles de turnos, pacientes y registros de
 * auditoría, de a una y con carga simultánea. Falla solo ante tiempos
 * claramente malos o respuestas de error: la idea es detectar consultas que no
 * escalan, no medir milisegundos exactos (el entorno de pruebas es lento).
 */
import { INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
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
import { addDays, clinicNow } from '../src/common/utils/clinic-time.util';

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
};

describe('QA: lectura y rendimiento con volumen (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let admin: { token: string };
  let reception: { token: string };
  let clinic: ClinicFixture;
  const report: string[] = [];
  const today = clinicNow().date;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    admin = await createUserAndLogin(app, Role.ADMIN);
    reception = await createUserAndLogin(app, Role.RECEPCIONISTA);
    clinic = await createClinic(app, admin.token);
  }, 180000);

  beforeEach(() => app.get(getStorageToken()).storage.clear());
  afterAll(async () => {
    console.log(
      '\nQA rendimiento (ms, 15 muestras seguidas)\n' + report.join('\n'),
    );
    await app.close();
  });

  async function measure(
    name: string,
    path: string,
    token: string | null,
    samples = 15,
    maxMs = 3000,
  ) {
    const times: number[] = [];
    let bytes = 0;
    for (let i = 0; i < samples; i++) {
      app.get(getStorageToken()).storage.clear();
      let req = request(server).get(`${API}${path}`);
      if (token) req = req.set(auth(token));
      const start = process.hrtime.bigint();
      const res = await req;
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
      expect(res.status).toBe(200);
      bytes = res.text.length;
    }
    const p50 = percentile(times, 50);
    const p95 = percentile(times, 95);
    report.push(
      `  ${name.padEnd(46)} p50 ${p50.toFixed(0).padStart(5)}  p95 ${p95.toFixed(0).padStart(5)}  máx ${Math.max(
        ...times,
      )
        .toFixed(0)
        .padStart(5)}  (${(bytes / 1024).toFixed(1)} kB)`,
    );
    expect(p95).toBeLessThan(maxMs);
  }

  describe('consultas de a una', () => {
    it('pacientes: búsqueda por apellido, por DNI y listado', async () => {
      await measure(
        'pacientes ?q=gonz (apellido)',
        '/admin/patients?q=gonz',
        reception.token,
      );
      await measure(
        'pacientes ?q=3011 (DNI parcial)',
        '/admin/patients?q=3011',
        reception.token,
      );
      await measure(
        'pacientes ?q=%25 (comodín)',
        '/admin/patients?q=%25',
        reception.token,
      );
      await measure(
        'pacientes sin filtro, limit=100',
        '/admin/patients?limit=100',
        reception.token,
      );
      await measure(
        'pacientes página 14 (profunda)',
        '/admin/patients?page=14',
        reception.token,
      );
    });

    it('turnos: un día, una semana y un mes', async () => {
      await measure(
        'turnos de hoy',
        `/admin/appointments?from=${today}&to=${today}`,
        reception.token,
      );
      await measure(
        'turnos de 7 días',
        `/admin/appointments?from=${today}&to=${addDays(today, 6)}`,
        reception.token,
      );
      await measure(
        'turnos de 31 días',
        `/admin/appointments?from=${addDays(today, -15)}&to=${addDays(today, 15)}`,
        reception.token,
      );
      await measure(
        'turnos ya atendidos (estado)',
        `/admin/appointments?from=${addDays(today, -30)}&to=${today}&status=ATENDIDO`,
        reception.token,
      );
    });

    it('auditoría con más de 16.000 registros: primera página, página profunda y filtros', async () => {
      await measure(
        'auditoría página 1',
        '/admin/audit-logs?limit=50',
        admin.token,
      );
      await measure(
        'auditoría página 100',
        '/admin/audit-logs?limit=50&page=100',
        admin.token,
      );
      await measure(
        'auditoría filtrada por acción',
        '/admin/audit-logs?limit=50&action=LOGIN',
        admin.token,
      );
      await measure(
        'auditoría filtrada por rango',
        `/admin/audit-logs?limit=50&from=${addDays(today, -7)}&to=${today}`,
        admin.token,
      );
    });

    it('disponibilidad pública (la consulta más pesada: calcula horarios de 31 días)', async () => {
      await measure(
        'disponibilidad 31 días',
        `/public/professionals/${clinic.professionalId}/availability?from=${addDays(today, 1)}&to=${addDays(today, 31)}`,
        null,
        10,
        4000,
      );
      await measure(
        'disponibilidad 1 día',
        `/public/professionals/${clinic.professionalId}/availability?from=${addDays(today, 1)}&to=${addDays(today, 1)}`,
        null,
      );
    });

    it('panel del médico, pedidos de copia, avisos y catálogos', async () => {
      await measure(
        'panel del médico (hoy)',
        '/doctor/dashboard',
        clinic.doctor.token,
      );
      await measure(
        'mis pacientes (médico)',
        '/doctor/patients',
        clinic.doctor.token,
      );
      await measure(
        'pedidos de copia (todos)',
        '/admin/history-exports?scope=all',
        reception.token,
      );
      await measure(
        'resumen de pedidos de copia',
        '/admin/history-exports/summary',
        reception.token,
      );
      await measure(
        'avisos por WhatsApp pendientes',
        '/admin/whatsapp-reminders',
        reception.token,
      );
      await measure('usuarios (admin)', '/auth/listar-usuarios', admin.token);
      await measure('profesionales', '/admin/professionals', admin.token);
      await measure(
        'aviso de privacidad (público)',
        '/public/privacy-notice',
        null,
      );
      await measure('configuración pública', '/public/settings', null);
    });
  });

  describe('con carga simultánea', () => {
    it('80 consultas de pacientes a la vez: todas bien y en tiempo razonable', async () => {
      const start = Date.now();
      const results = await Promise.all(
        Array.from({ length: 80 }, (_, i) =>
          request(server)
            .get(
              `${API}/admin/patients?q=${['gonz', 'perez', '3011', 'mar'][i % 4]}`,
            )
            .set(auth(reception.token)),
        ),
      );
      const ms = Date.now() - start;
      report.push(`  80 búsquedas de pacientes simultáneas: ${ms} ms en total`);
      expect(
        results.filter((r) => r.status !== 200).map((r) => r.status),
      ).toEqual([]);
      expect(ms).toBeLessThan(20000);
    });

    it('50 consultas de disponibilidad a la vez (31 días): todas bien', async () => {
      const start = Date.now();
      const results = await Promise.all(
        Array.from({ length: 50 }, () =>
          request(server).get(
            `${API}/public/professionals/${clinic.professionalId}/availability?from=${addDays(today, 1)}&to=${addDays(today, 31)}`,
          ),
        ),
      );
      const ms = Date.now() - start;
      report.push(
        `  50 disponibilidades de 31 días simultáneas: ${ms} ms en total`,
      );
      expect(
        results.filter((r) => r.status !== 200).map((r) => r.status),
      ).toEqual([]);
      expect(ms).toBeLessThan(30000);
    });

    it('mezcla de 120 pedidos de lectura de todos los roles a la vez: ningún error', async () => {
      const calls = [
        () =>
          request(server)
            .get(
              `${API}/admin/appointments?from=${today}&to=${addDays(today, 6)}`,
            )
            .set(auth(reception.token)),
        () =>
          request(server)
            .get(`${API}/admin/audit-logs?limit=20`)
            .set(auth(admin.token)),
        () =>
          request(server)
            .get(`${API}/doctor/dashboard`)
            .set(auth(clinic.doctor.token)),
        () =>
          request(server)
            .get(`${API}/admin/whatsapp-reminders`)
            .set(auth(reception.token)),
        () => request(server).get(`${API}/public/specialties`),
        () =>
          request(server)
            .get(`${API}/admin/history-exports/summary`)
            .set(auth(reception.token)),
      ];
      const start = Date.now();
      const results = await Promise.all(
        Array.from({ length: 120 }, (_, i) => calls[i % calls.length]()),
      );
      report.push(
        `  120 lecturas mezcladas simultáneas: ${Date.now() - start} ms en total`,
      );
      expect(
        results
          .filter(
            (r) => r.status >= 500 || r.status === 401 || r.status === 403,
          )
          .map((r) => r.status),
      ).toEqual([]);
    });
  });
});
