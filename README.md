# Turnero: sistema de consultorio médico

Sistema para gestionar un consultorio: **turnos y agenda**, **pacientes**, **historia clínica** y **llamado de pacientes** a la sala de espera por pantalla y voz. Es un repositorio único con dos partes:

- [`Backend/`](Backend): API en NestJS + TypeORM + MySQL.
- [`Frontend/`](Frontend): aplicación web en React + TypeScript + Vite + Tailwind.

## Qué incluye

El sistema tiene cuatro experiencias, cada una con su propio diseño:

| Quién | Dónde | Qué hace |
|---|---|---|
| **Paciente** (sin cuenta) | `/` y `/mi-turno` | Reserva un turno en 5 pasos (especialidad, profesional, fecha, horario, datos) y recibe un código. Con el código y su DNI consulta o cancela el turno. |
| **Recepción** | `/recepcion` | Inicio con lo que hay que resolver ahora, agenda, alta de turnos, pacientes con obra social, confirmar asistencia, cancelar y reprogramar. Sin acceso clínico. |
| **Médico** | `/medico` | Turnos de hoy y próximos, **llamado de pacientes**, atención, consulta (borrador y finalizada), historia clínica y mis pacientes. |
| **Administración** | `/admin` | Usuarios, profesionales, especialidades, obras sociales, consultorios, horarios y ausencias, pantallas de sala, auditoría y configuración. |
| **Pantalla de sala** (TV) | `/pantalla` | Muestra y dice a quién se llama y a qué consultorio. Se conecta con un token propio, no con un usuario. |

Roles: `ADMIN`, `RECEPCIONISTA` y `MEDICO`. El paciente no tiene cuenta.

### Reglas de diseño que no se negocian

- **Usuario, profesional y paciente son cosas distintas.** Las credenciales viven en el usuario; la matrícula y las especialidades en el perfil profesional; el paciente no tiene cuenta.
- **Turno y consulta son entidades separadas.** El turno es la reserva; la consulta es lo que pasó en la atención. Nunca se guardan datos clínicos en el turno.
- **Una consulta finalizada no se modifica.** Se corrige solo con enmiendas, y la base de datos lo hace cumplir con triggers. La auditoría y el historial son de solo agregar.
- **Acceso clínico = permiso + relación.** Un médico solo ve pacientes con los que tiene o tuvo un turno. ADMIN no tiene permisos clínicos.
- **Doble reserva imposible:** bloqueo del profesional, recálculo de disponibilidad dentro de la transacción e índice único en la base. Hay un test con 10 reservas simultáneas.
- **Nada se borra:** especialidades, consultorios, profesionales y horarios se desactivan.

## Puesta en marcha

Requisitos: **Node.js 22 o superior** y **MySQL 8.4**.

### 1. Base de datos

Crea la base y un usuario de la aplicación **sin permisos de estructura** (la app no necesita crear ni borrar tablas):

```sql
CREATE DATABASE turnero CHARACTER SET utf8mb4;
CREATE USER 'turnero_app'@'localhost' IDENTIFIED BY 'una-clave-larga';
GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON turnero.* TO 'turnero_app'@'localhost';
```

Se recomienda MySQL en modo estricto (`STRICT_TRANS_TABLES`) y escuchando solo en `127.0.0.1`.

### 2. Backend

```bash
cd Backend
cp .env.example .env        # completar DB_*, SECRET_WORD, SEED_ADMIN_*, MAIL_*
npm install
```

Las **migraciones** necesitan un usuario con permisos de estructura (crear tablas, triggers). Se le pasa por variables del momento, sin guardarlas en el `.env`:

```bash
MIGRATION_DB_USER=root MIGRATION_DB_PASSWORD=<clave> npm run migration:run   # bash
$env:MIGRATION_DB_USER='root'; $env:MIGRATION_DB_PASSWORD='<clave>'; npm run migration:run   # PowerShell
```

```bash
npm run start:dev           # API en http://localhost:3006/api
```

Con una base nueva no existe ningún usuario: si en el `.env` están `SEED_ADMIN_NICK` y `SEED_ADMIN_PASSWORD`, se crea el primer administrador al arrancar. **Sácalos del `.env` después del primer arranque.**

### 3. Frontend

```bash
cd Frontend
cp .env.example .env        # VITE_API_BASE_URL y VITE_CLINIC_NAME
npm install
npm run dev                 # http://localhost:5173
```

### 4. Primeros pasos en el sistema

Entra como administrador y carga, en este orden: especialidades, consultorios, usuarios médicos y sus profesionales, horarios. Con eso ya se pueden reservar turnos. Para la TV de la sala, ver [GUIA-PANTALLA-SALA.md](GUIA-PANTALLA-SALA.md).

## Tests

```bash
cd Backend
npm test                    # unitarios
npm run test:e2e            # de punta a punta contra una base MySQL real

cd ../Frontend
npx tsc -b --noEmit && npm run lint && npx vite build
```

Los e2e usan una base **separada** llamada `<DB_NAME>_e2e` (nunca la de desarrollo), que crean y migran con las credenciales `MIGRATION_DB_USER` y `MIGRATION_DB_PASSWORD`. El usuario de la aplicación necesita permisos de datos sobre esa base:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON turnero_e2e.* TO 'turnero_app'@'localhost';
```

El Frontend no tiene tests automáticos: sus flujos se verificaron en el navegador.

## Seguridad

- Contraseñas con argon2. Sesiones con JWT; el rol se lee de la base en cada pedido y las sesiones se invalidan al cambiar la clave o cerrar sesión.
- Bloqueo de cuenta de 15 minutos tras 10 intentos fallidos y límite de pedidos en los endpoints públicos.
- Verificación en dos pasos (TOTP) exigible por rol desde Configuración.
- Validación en el backend de cada campo según su columna; CORS cerrado por defecto; cabeceras de seguridad y CSP en el build del frontend.
- Auditoría de accesos clínicos, inicios de sesión y cambios, sin contenido clínico.
- Hay baterías de ataques directos a la API (permisos de todos los endpoints por rol, reserva pública, límites de campos y pantallas de sala).

### Antes de publicarlo en producción

- `CORS_ORIGIN` con la URL real del frontend, `FRONTEND_URL`, HTTPS y `TRUST_PROXY` si hay un proxy delante.
- SMTP configurado (mails de turnos, recordatorios y recuperación de clave).
- Definir `TWO_FACTOR_KEY` (clave propia para cifrar los secretos de la verificación en dos pasos).
- Quitar `SEED_ADMIN_*` del `.env` y cambiar la clave de `root` de MySQL por una larga y aleatoria.
- Que la API escuche solo en `127.0.0.1` detrás del proxy (hoy escucha en todas las interfaces).
- Si se usa nginx para el stream de la pantalla de sala: `proxy_buffering off` (ver la guía de la TV).

## Qué no incluye (por ahora)

Recetas, órdenes médicas, archivos adjuntos, firma digital y avisos por WhatsApp o SMS. La arquitectura está preparada para sumarlos sin tocar los turnos (eventos desacoplados y un hash del contenido de cada consulta para la firma).

## Más documentación

- [`Backend/CLAUDE.md`](Backend/CLAUDE.md): arquitectura del backend, reglas del dominio y comandos.
- [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md): arquitectura del frontend, sistema de diseño y convenciones.
- [`GUIA-PANTALLA-SALA.md`](GUIA-PANTALLA-SALA.md): cómo instalar y configurar la pantalla de la sala de espera.
