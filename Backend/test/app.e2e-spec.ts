import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, prepareE2eDatabase } from './e2e-helpers';

// Requiere una base de datos real y accesible con las credenciales de .env
// (igual que en desarrollo: AppModule arma la conexión de TypeORM al
// bootear). No depende de datos previos en la tabla `users` — los casos de
// acá dan 401/400 sin necesidad de un usuario preexistente.
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prepareE2eDatabase();
    app = await createE2eApp();
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login con nickUsuario inexistente devuelve 401 con mensaje genérico', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ nickUsuario: 'no-existe-e2e', password: 'cualquiera' })
      .expect(401)
      .expect((res) => {
        expect(res.body.message).toMatch(/^Usuario o contraseña inválidos/);
      });
  });

  it('POST /auth/login con body inválido devuelve 400', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ nickUsuario: '' })
      .expect(400);
  });

  it('POST /auth/nuevo-usuario sin token devuelve 401 (no hay auto-registro público)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/nuevo-usuario')
      .send({
        nickUsuario: 'nuevo-e2e',
        nombre: 'Test',
        apellido: 'E2E',
        email: 'nuevo-e2e@example.com',
        password: 'Passw0rd1',
        role: 'ADMIN',
      })
      .expect(401);
  });

  it('GET /auth/profile sin token devuelve 401', () => {
    return request(app.getHttpServer()).get('/api/auth/profile').expect(401);
  });

  it('GET /auth/listar-usuarios sin token devuelve 401', () => {
    return request(app.getHttpServer())
      .get('/api/auth/listar-usuarios')
      .expect(401);
  });
});
