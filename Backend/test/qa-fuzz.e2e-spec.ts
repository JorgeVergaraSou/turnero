/**
 * QA: fuzzing de TODOS los endpoints. Para cada ruta de la app y cada rol que
 * puede entrar, se mandan entradas hostiles o mal formadas (tipos cambiados,
 * textos enormes, unicode, inyecciones, ids absurdos, paginación imposible,
 * claves de prototipo…). Invariante: NUNCA un error de servidor (5xx), siempre
 * una respuesta JSON con el motivo, y la API sigue respondiendo después.
 */
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import {
  API,
  auth,
  createE2eApp,
  createUserAndLogin,
  prepareE2eDatabase,
} from './e2e-helpers';
import { createClinic } from './e2e-fixtures';
import { Role } from '../src/common/enums/role.enum';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { DEVICE_AUTH_KEY } from '../src/displays/decorators/device-auth.decorator';
import {
  PERMISSIONS_KEY,
  Permission,
} from '../src/auth/permissions/permission.enum';
import { roleHasPermissions } from '../src/auth/permissions/role-permissions';

interface RouteInfo {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  isPublic: boolean;
  isDeviceAuth: boolean;
  isSse: boolean;
  roles?: Role[];
  permissions?: Permission[];
}

function discoverRoutes(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const clean = (p: string) => p.replace(/^\/+|\/+$/g, '');
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as
        | (new (...a: never[]) => object)
        | null;
      if (!controller) continue;
      const base = clean(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | undefined;
        if (path === undefined) continue;
        const meta = <T>(key: string): T | undefined =>
          Reflect.getMetadata(key, handler) ??
          Reflect.getMetadata(key, controller);
        routes.push({
          method: RequestMethod[
            Reflect.getMetadata(METHOD_METADATA, handler) as number
          ].toLowerCase() as RouteInfo['method'],
          path: `${API}/${[base, clean(path)].filter(Boolean).join('/')}`,
          isDeviceAuth: meta<boolean>(DEVICE_AUTH_KEY) === true,
          isSse: Reflect.getMetadata('__sse__', handler) === true,
          isPublic:
            meta<boolean>(IS_PUBLIC_KEY) === true &&
            meta<boolean>(DEVICE_AUTH_KEY) !== true,
          roles: meta<Role[]>(ROLES_KEY),
          permissions: meta<Permission[]>(PERMISSIONS_KEY),
        });
      }
    }
  }
  return routes;
}

/** ¿Este rol puede entrar? (los que no, ya los cubre la matriz de permisos) */
function allowed(route: RouteInfo, role: Role): boolean {
  if (route.isPublic) return true;
  if (route.isDeviceAuth) return false;
  if (route.roles?.length)
    return role === Role.ADMIN || route.roles.includes(role);
  if (route.permissions?.length)
    return roleHasPermissions(role, route.permissions);
  return false;
}

function readSseStatus(res: any, done: (e: Error | null, b: any) => void) {
  if (res.statusCode === 200) {
    res.destroy();
    done(null, {});
    return;
  }
  let raw = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => (raw += c));
  res.on('end', () => {
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(null, {});
    }
  });
}

const deep = (n: number): unknown => (n === 0 ? 'x' : { a: deep(n - 1) });
const BODIES: unknown[] = [
  {},
  [],
  null,
  'texto suelto',
  12345,
  { __proto__: { admin: true }, constructor: { prototype: { x: 1 } } },
  JSON.parse('{"__proto__":{"polluted":true}}'),
  { id: -1, page: -1, limit: -1, patientId: -5, professionalId: 0 },
  { id: 99999999999999, patientId: 1e30, professionalId: 'abc' },
  {
    name: 'x'.repeat(5000),
    reason: 'y'.repeat(5000),
    summary: 'z'.repeat(5000),
  },
  {
    nombre: '😀'.repeat(300),
    apellido: '\u0000\u0001\u0002',
    documentNumber: "1'; DROP TABLE patients;--",
  },
  {
    email: 'no-es-un-email',
    phone: '<script>alert(1)</script>',
    date: '2026-13-45',
    startTime: '25:99',
  },
  {
    date: null,
    startTime: null,
    patientId: null,
    privacyVersion: null,
    identityConfirmed: 'si',
  },
  { a: deep(40) },
  { items: Array.from({ length: 2000 }, (_, i) => i) },
  { privacyVersion: 'uno', professionalId: [1, 2, 3], specialtyId: { $gt: 0 } },
  { isDraft: 'false', outcome: 'ENVIADO', stage: 99, scope: 'todo' },
];
const QUERIES = [
  '',
  '?page=0&limit=0',
  '?page=-1&limit=-1',
  '?page=abc&limit=xyz',
  '?page=99999999999&limit=99999999999',
  '?q=%25&limit=5',
  '?q=' + encodeURIComponent("' OR 1=1 --"),
  '?q=' + encodeURIComponent('😀'.repeat(200)),
  '?q=' + 'a'.repeat(3000),
  '?from=2026-02-30&to=garbage',
  '?from=2026-01-01&to=2099-12-31',
  '?patientId=-1&professionalId=abc&date=nope',
  '?status[]=A&status[]=B&scope[]=x',
  '?sort=__proto__&order=;drop',
];
const PARAM_VALUES = [
  '0',
  '-1',
  'abc',
  '99999999999999999999',
  '1%20OR%201=1',
  '%00',
  '1.5',
];

describe('QA: fuzzing de todos los endpoints (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let routes: RouteInfo[];
  const tokens: Partial<Record<Role, string>> = {};

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
    server = app.getHttpServer();
    const admin = await createUserAndLogin(app, Role.ADMIN);
    tokens[Role.ADMIN] = admin.token;
    tokens[Role.RECEPCIONISTA] = (
      await createUserAndLogin(app, Role.RECEPCIONISTA)
    ).token;
    const clinic = await createClinic(app, admin.token);
    tokens[Role.MEDICO] = clinic.doctor.token;
    routes = discoverRoutes(app);
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  const clearLimits = () => app.get(getStorageToken()).storage.clear();

  it('descubre los endpoints', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('ningún endpoint devuelve 5xx ante entradas hostiles (cuerpo, query y parámetros de ruta)', async () => {
    const failures: string[] = [];
    let sent = 0;
    for (const route of routes) {
      // lo que no se puede fuzzear sin romper la sesión de la prueba
      if (route.path.endsWith('/auth/logout')) continue;
      if (route.isDeviceAuth) continue;
      const roles = (Object.keys(tokens) as Role[]).filter((r) =>
        allowed(route, r),
      );
      const identities: (string | null)[] = route.isPublic
        ? [null]
        : roles.map((r) => tokens[r]!);
      for (const token of identities) {
        const withParams = (value: string) =>
          route.path.replace(/:\w+/g, value);
        const urls = [
          ...PARAM_VALUES.map((v) => withParams(v)),
          ...QUERIES.map((qs) => withParams('1') + qs),
        ];
        for (const url of urls) {
          clearLimits();
          sent++;
          let req = (request(server) as any)[route.method](url);
          if (token) req = req.set(auth(token));
          if (route.isSse) req = req.buffer(false).parse(readSseStatus);
          if (
            route.method === 'post' ||
            route.method === 'patch' ||
            route.method === 'put'
          ) {
            req = req
              .set('Content-Type', 'application/json')
              .send(JSON.stringify(BODIES[sent % BODIES.length]));
          }
          const res = await req;
          if (res.status >= 500) {
            failures.push(
              `${route.method.toUpperCase()} ${url.slice(0, 90)} → ${res.status}`,
            );
          } else if (res.status < 200 || res.status >= 600) {
            failures.push(
              `${route.method.toUpperCase()} ${url} → estado raro ${res.status}`,
            );
          }
        }
        // cada cuerpo, una vez, sobre una URL con id válido-ish
        for (const body of BODIES) {
          if (!['post', 'patch', 'put'].includes(route.method)) break;
          clearLimits();
          sent++;
          let req = (request(server) as any)[route.method](withParams('1'));
          if (token) req = req.set(auth(token));
          if (route.isSse) continue;
          const res = await req
            .set('Content-Type', 'application/json')
            .send(JSON.stringify(body));
          if (res.status >= 500) {
            failures.push(
              `${route.method.toUpperCase()} ${withParams('1')} cuerpo ${JSON.stringify(body).slice(0, 60)} → ${res.status}`,
            );
          }
        }
      }
    }
    console.log(
      `QA fuzz: ${sent} peticiones hostiles enviadas a ${routes.length} endpoints`,
    );
    expect(failures).toEqual([]);
  }, 900000);

  it('JSON mal formado, tipo de contenido raro y métodos no definidos: nunca 5xx', async () => {
    const cases: Array<() => request.Test> = [
      () =>
        request(server)
          .post(`${API}/public/appointments`)
          .set('Content-Type', 'application/json')
          .send('{"a":'),
      () =>
        request(server)
          .post(`${API}/public/appointments`)
          .set('Content-Type', 'application/json')
          .send('\u0000\u0000'),
      () =>
        request(server)
          .post(`${API}/auth/login`)
          .set('Content-Type', 'text/plain')
          .send('nickUsuario=a&password=b'),
      () =>
        request(server)
          .post(`${API}/auth/login`)
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('nickUsuario=a&password=b'),
      () =>
        request(server)
          .post(`${API}/auth/login`)
          .set('Content-Type', 'multipart/form-data; boundary=x')
          .send('--x--'),
      () => request(server).delete(`${API}/public/settings`),
      () => request(server).put(`${API}/public/settings`).send({}),
      () => request(server).options(`${API}/public/settings`),
      () => request(server).head(`${API}/public/settings`),
      () => request(server).get(`${API}/public/settings/`),
      () => request(server).get(`${API}//public//settings`),
      () => request(server).get(`${API}/public/%00`),
      () => request(server).get(`${API}/public/..%2f..%2fetc%2fpasswd`),
      () => request(server).get(`/uploads/../.env`),
      () => request(server).get(`/uploads/avatars/..%2f..%2f.env`),
      () => request(server).get(`/uploads/%2e%2e/%2e%2e/package.json`),
      () => request(server).get(`${API}/` + 'a'.repeat(9000)),
      () =>
        request(server)
          .get(`${API}/public/settings`)
          .set('X-Forwarded-For', '1.1.1.1, 2.2.2.2')
          .set('Authorization', 'Bearer ' + 'x'.repeat(8000)),
      () =>
        request(server)
          .get(`${API}/admin/patients`)
          .set('Authorization', 'Basic YWRtaW46YWRtaW4='),
      () =>
        request(server)
          .get(`${API}/admin/patients`)
          .set('Authorization', 'Bearer '),
      () =>
        request(server)
          .get(`${API}/admin/patients`)
          .set('Authorization', 'Bearer null'),
      () =>
        request(server)
          .get(`${API}/admin/patients`)
          .set(
            'Authorization',
            'Bearer eyJhbGciOiJub25lIn0.eyJpZFVzZXIiOjEsInJvbGUiOiJBRE1JTiJ9.',
          ),
    ];
    const failures: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      clearLimits();
      const res = await cases[i]();
      if (res.status >= 500) failures.push(`caso ${i} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('el token con firma "none" o alterado nunca da acceso', async () => {
    const [h, p] = tokens[Role.ADMIN]!.split('.');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    for (const t of [
      none,
      `${h}.${p}.firmafalsa`,
      `${h}.${p}`,
      `x.${p}.${tokens[Role.ADMIN]!.split('.')[2]}`,
    ]) {
      await request(server)
        .get(`${API}/admin/patients`)
        .set(auth(t))
        .expect(401);
    }
  });

  it('la API sigue sana después de todo: responde y la base contesta', async () => {
    clearLimits();
    await request(server).get(`${API}/public/settings`).expect(200);
    await request(server)
      .get(`${API}/admin/patients`)
      .set(auth(tokens[Role.ADMIN]!))
      .expect(200);
  });
});
