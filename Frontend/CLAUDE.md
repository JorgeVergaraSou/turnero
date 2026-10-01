# base-auth-react (contexto para Claude Code)

## Estado actual: sistema de consultorio médico

Esta base ya es el frontend del sistema de turnos + historia clínica de [../turnero.MD](../turnero.MD) (la sección "Qué es este proyecto" de abajo describe la plantilla original). Tres experiencias:

- **Paciente** (sin cuenta, mobile-first): `/` reserva en 5 pasos ([pages/Public/Booking](src/pages/Public/Booking/Booking.tsx)) y `/mi-turno` (código + DNI). Layout [PublicLayout](src/layouts/PublicLayout.tsx). Se carga de entrada; todo lo del personal es `lazy`.
- **Recepción** (`/recepcion`, RECEPCIONISTA y ADMIN): inicio de recepción (`/recepcion`, solo lo que hay que resolver ahora: sin resolver, por llegar, sala de espera, confirmaciones de mañana, ausencias con turnos afectados; se refresca solo cada minuto), agenda (`/recepcion/agenda`, acepta `?fecha=&profesional=` — ver `StaffPaths.agendaFor`), dar turno, pacientes. El "Inicio" de recepción solo lo ve RECEPCIONISTA (ADMIN tiene el suyo).
- **Administración** (`/admin`, ADMIN): inicio (dashboard + checklist de configuración), profesionales, horarios y ausencias, especialidades, consultorios, usuarios (editar, cambiar clave, dar de baja), auditoría y configuración. ADMIN **no** ve el panel médico.
- **Médico** (`/medico`, MEDICO): turnos de hoy + columna "Próximos turnos" (14 días, `GET doctor/appointments?from&to`; tocar un día lo abre en la lista principal), atención (`/medico/atencion/:appointmentId` — iniciar es idempotente; Ctrl+S guarda borrador; aviso al salir con cambios), mis pacientes e historia clínica.

Roles `ADMIN` / `RECEPCIONISTA` / `MEDICO` (espejo del backend), rutas en `StaffPaths` ([models/routes.ts](src/models/routes.ts)), menú por rol en [StaffLayout](src/layouts/StaffLayout.tsx). La API está bajo `/api` (`VITE_API_BASE_URL`); `VITE_CLINIC_NAME` es el nombre que ve el paciente. Servicios del dominio en [services/clinic.service.ts](src/services/clinic.service.ts) (`publicApi`, `adminApi`, `receptionApi`, `doctorApi`), tipos en [interfaces/clinic.interface.ts](src/interfaces/clinic.interface.ts).

**Llamado de pacientes (panel médico)**: [CallPatientButton](src/components/CallPatientButton.tsx) en cada fila de `DoctorHome` con turno `CONFIRMADO` de hoy (`doctorApi.call` → `POST doctor/appointments/:id/call`). Maneja él mismo la cuenta regresiva de `nextCallInSeconds`, el tope (`remainingCalls`) y el error inline; no recuerda llamados previos tras recargar (el backend es quien aplica la pausa y el tope).

**Pantalla de sala** (`/pantalla`, [DisplayScreen](src/pages/Display/DisplayScreen.tsx)): ruta pública fuera de los layouts, autenticada con un **token de pantalla** (no con usuario). [useDisplayStream](src/hooks/useDisplayStream.ts) lee `GET display/stream` con `fetch` + `Authorization: Bearer` (el EventSource no manda cabeceras), parsea los eventos `snapshot`/`call`/`ping`, reconecta con espera creciente y un watchdog de 50 s; un 401 no reintenta. El token se guarda en `localStorage` (`display-token`) y puede venir como `#token=…` (se borra de la URL). Diseño: tokens `ink-deep`, `eucalyptus-glow` y `signal` en `@theme`, tamaños en `vw`/`vh` con `min()`, un solo movimiento (`.call-fresh` en index.css). Ojo: el estilo base `h1,h2,h3 { text-ink }` pisa el color heredado, así que los títulos sobre fondo oscuro llevan `text-paper` explícito. Tras agregar una página nueva con clases nuevas, si Vite en desarrollo no las aplica, reiniciar `npm run dev`.

**Sonido de la pantalla de sala**: [CallAnnouncer](src/utilities/callAnnouncer.utility.ts) (clase sin React: cola, timbre con WebAudio, `speechSynthesis`, `VOICE_REPEATS = 2`) envuelta por [useCallAnnouncer](src/hooks/useCallAnnouncer.ts). `useDisplayStream(token, onCall)` llama a `onCall` solo con los llamados EN VIVO (el `snapshot` nunca suena). El navegador exige un gesto del usuario: `activate()` va en el clic de "Activar sonido" (no se puede activar solo; en un televisor en modo kiosco Chrome acepta `--autoplay-policy=no-user-gesture-required`). Las voces dependen del navegador y del sistema: `pickSpanishVoice` prefiere es-AR > latinoamericanas > es-*; sin voz en español se avisa 30 s y se sigue hablando con la voz por defecto. Cada llamado: timbre + frase repetida, tope de seguridad por si el televisor nunca dispara `onend`.

**Pantallas de sala y configuración del llamado**: administración en [Admin/Displays](src/pages/Admin/Displays.tsx) (`/admin/pantallas`; el token se muestra una sola vez en un modal con botones de copiar el token y el enlace `…/pantalla#token=…`) y sección «Llamado de pacientes» en [Settings](src/pages/Admin/Settings.tsx). La TV recibe el nombre ya formateado (`displayName`) y lo que dice la voz (`spokenName`); `useDisplayStream` expone `enabled` y llama a `onConfig` para las repeticiones de voz. `DoctorHome` oculta el botón Llamar si `settings.callsEnabled === false`. Guía de instalación para quien monta la TV: [../GUIA-PANTALLA-SALA.md](../GUIA-PANTALLA-SALA.md).

**Sistema de diseño** (ya no es "Tailwind sin diseño"): tokens en `@theme` de [index.css](src/index.css) con nombres del dominio (`ink`, `paper`, `sheet`, `eucalyptus`, `line`, y `st-*` uno por estado de turno — mismo color en todas las pantallas). Tipografía Atkinson Hyperlegible Next (+ Mono solo para datos que se dictan/copian: códigos, horas, DNI). Componentes en [components/ui](src/components/ui/) (`Button` con variantes, `TextInput`/`SelectInput`/`TextArea` con label+error accesibles, `StatusBadge`, `Panel`, `Modal`, `PageHeader`, `EmptyState`, `ErrorNotice`, `Spinner`). El único elemento "expresivo" es el comprobante de turno (`.ticket`, [AppointmentTicket](src/components/AppointmentTicket.tsx)); el resto se mantiene sobrio — no agregar decoración. Evitar: labels en mayúsculas, meta-textos con "·", cards idénticas en grilla.

**Fechas**: el backend trabaja con 'YYYY-MM-DD' + 'HH:mm:ss' locales del consultorio; [dates.utility.ts](src/utilities/dates.utility.ts) nunca las convierte a UTC (`clinicToday()`, `clinicTime()`, `hasStarted()`, formato 24 h).

**Datos de pantalla**: hook [useAsync](src/hooks/useAsync.ts) (`loading` derivado de la clave de deps, sin setState sincrónico en efectos — lo exige `react-hooks/set-state-in-effect`). Helpers compartidos (labels, `formatCode`, `vitalsSummary`) van en `utilities/`, no exportados desde archivos de componentes (`react-refresh/only-export-components`, y el lint corre con `--max-warnings 0`).

**Configuración del consultorio**: [useClinicSettings](src/hooks/useClinicSettings.ts) lee `GET public/settings` una sola vez para toda la app (nombre, teléfono, reserva online, horizonte, anticipación para cancelar); `VITE_CLINIC_NAME` queda solo como valor mientras carga. Después de guardar en /admin/configuracion se llama `notifyClinicSettingsChanged()` y todos los que la usan se refrescan.

**CSP (Content-Security-Policy)**: la agrega el plugin de [vite.config.ts](vite.config.ts) como meta tag **solo en el build** (en dev rompería el HMR): `script-src 'self'` y `connect-src` limitado al origen de `VITE_API_BASE_URL`, así un XSS no puede ejecutar scripts inyectados ni mandar el token a otro dominio. Si se agrega un recurso externo nuevo (otra fuente, un CDN, un iframe), hay que sumarlo ahí o el navegador lo bloquea. `frame-ancestors` no funciona en meta: si el frontend se sirve con un servidor web, configurarla como header.

**Interceptor**: un 401 / servidor caído solo cierra sesión y redirige a `/login` si **había** sesión del personal; el paciente en el flujo público ve el error en la página.

## Qué es este proyecto

**No es una app real.** Es una **base/plantilla** de React + TypeScript + Vite
con autenticación, sesión y llamadas HTTP ya resueltas, pensada para
arrancar proyectos nuevos sin reescribir esa parte cada vez. Cuando alguien
pida "creá un proyecto nuevo a partir de esto" o similar, el flujo es: copiar
esta carpeta, cambiar `.env`, y reemplazar las páginas/el menú de ejemplo —
no tocar la arquitectura de auth/HTTP salvo que se pida explícitamente.

Este proyecto vive al lado de `siscofar-frontend` (`../siscofar-frontend`),
un sistema hospitalario real construido por el mismo usuario. Varias
convenciones de acá vienen de ahí (mismo alias `@/`, mismo patrón de
interceptor axios, mismo estilo de `getErrorMessage`), pero **acá no hay
dominio de negocio** — todo lo de `pages/Private/Admin`, `User`, `Guest`,
el menú de `DropdownMenu.tsx`, etc. es contenido de ejemplo/demo, no algo a
mantener con cuidado.

## Historia reciente (por qué está como está)

El repo arrancó como un clon/experimento (`<title>TESTEO</title>` original,
sin `node_modules` instalado nunca, **nunca se había corrido un build real**
hasta la limpieza descripta abajo). Tenía bastante código pegado de
siscofar-frontend a medio adaptar. Se hizo una limpieza completa en una
sesión (ver git log) que:

1. Agregó el alias `@/` (`vite.config.ts` + `tsconfig.app.json`).
2. Reemplazó un interceptor de axios que no hacía nada (`src/interceptors/`,
   **ya no existe**) por una instancia real con manejo de token/errores
   (`src/api/axios.ts`).
3. Agregó manejo centralizado de errores (`getErrorMessage`) y alertas
   (`alert.utils.ts`, `session-alerts.utils.ts`, SweetAlert2 — se agregó
   como dependencia nueva).
4. Arregló la seguridad de sesión: validación de expiración del JWT al
   hidratar el store (antes no existía, el "usuario viejo" podía quedar
   logueado con un token vencido), guard de auth simplificado, `RoleGuard`
   pasado de un solo rol a `roles: Roles[]`.
5. Limpieza general: borró imports/exports colgantes que apuntaban a
   archivos inexistentes (`IngresoProductos`, `Admin/Profile.tsx` duplicado
   — el proyecto nunca se había buildeado, así que nadie lo había notado),
   sacó una ruta (`INGRESO_PRODUCTOS`) y una imagen (`bgfarma.jpg`) que eran
   residuo de siscofar, migró `.eslintrc.cjs` (formato viejo) a
   `eslint.config.js` (flat config, lo que pide ESLint 9).

Point de partida: **`npx tsc -b --noEmit`, `npm run lint` y
`npx vite build` corren limpios.** Si alguno de los tres falla al arrancar
una sesión nueva, algo se rompió después de esto — no es el estado normal.

## Arquitectura (esto sí hay que mantener con cuidado)

### Alias `@/`
Apunta a `src/` (`vite.config.ts` → `resolve.alias`, `tsconfig.app.json` →
`compilerOptions.paths`). Usarlo para cualquier import que cruce de un
módulo a otro (`@/models`, `@/services`, `@/utilities`, `@/interfaces`,
`@/redux/store`). Dentro de un mismo módulo (ej. entre dos componentes de
`src/components/`), una ruta relativa corta (`../Logout/Logout`) está bien
— no forzar el alias ahí.

### Cliente HTTP centralizado — `src/api/axios.ts`
Instancia única `api` (axios) que **todos** los services deben usar en vez
de `axios` importado directo:
- Interceptor de **request**: agrega `Authorization: Bearer <token>` leyendo
  el usuario de `localStorage` (`UserKey`, en `redux/states/user.ts`). Por
  esto **los services no reciben `token` como parámetro** — si ves un
  service pidiendo `token`, es código viejo sin migrar.
- Interceptor de **response**:
  - `401` → limpia `localStorage`, muestra `sesionVencidaAlert()` y
    redirige a `/login` (bandera `avisandoSesionVencida` para no apilar
    alertas). **Excepción: un 401 del propio `/auth/login`** es "usuario o
    contraseña inválidos", no sesión vencida — no limpia ni redirige, así
    la pantalla de Login puede mostrar el mensaje.
  - Sin respuesta del servidor (caído / sin red / `ERR_CONNECTION_REFUSED`)
    → limpia sesión, muestra `servidorNoDisponibleAlert()` y redirige a
    `/login`. Usa una bandera de módulo (`avisandoServidorCaido`) para no
    disparar la alerta varias veces si hay varios requests en paralelo
    fallando a la vez.
  - Cualquier otro error se normaliza a `new Error(mensaje)` (tomado de
    `error.response?.data?.message`; si es un array — errores de validación
    del backend — se une en un solo texto), así el `catch` del consumidor
    nunca necesita leer `error.response.data.message` a mano.

### Contrato con el backend (Base-autenticacion/Backend)
- Login por `nickUsuario` + `password` (no email). El JWT trae
  `{ idUser, nickUsuario, role, name }` — eso es `DecodedToken`/`UserInfo`.
- **No hay registro público.** El alta es `/nuevo-usuario`
  (`pages/Private/NuevoUsuario`), ruta solo ADMIN, que llama a
  `POST /auth/nuevo-usuario`. El `<select>` de rol no ofrece ADMIN a
  propósito.
- Recuperación de clave: botón "¿Olvidaste la clave?" en Login (pide
  nick + email → `POST /auth/requestResetPassword`) y la página pública
  `/reset-password?token=...` (`pages/Login/ResetPassword.tsx` →
  `POST /auth/resetPassword`). La ruta `reset-password` tiene que coincidir
  con la que arma el backend con `FRONTEND_URL`.
- Los endpoints de mutación del backend responden vacío (sin
  `{ success, message }`): el texto de éxito lo pone el frontend.

### Errores y alertas
- `src/utilities/errors/getErrorMessage.utility.ts` → `getErrorMessage(error)`.
  Usar en **todo** `catch`, en vez de `error.message`/`error?.message` a mano.
- `src/utilities/alerts/alert.utils.ts` → `showSuccess(title, text?)` /
  `showError(text, title?)`, wrappers de SweetAlert2. Si un proyecto nuevo
  necesita alertas de negocio propias (mensajes específicos repetidos),
  agregarlas en un archivo nuevo (ej. `<proyecto>-alerts.utils.ts`), sin
  tocar `session-alerts.utils.ts` (esa es solo del interceptor).

### Sesión y seguridad de páginas
- `src/redux/states/user.ts`: `getInitialUserState()` valida, al hidratar
  el store desde `localStorage`, que el JWT no esté vencido (lo decodifica
  con `jwt-decode`). Si expiró o el storage está corrupto, arranca en
  `EmptyUserState` en vez de dejar una sesión "logueada" que no puede pedir
  nada real. **Esta es la única validación de expiración que debe existir**
  — no duplicarla en un guard o en un `useEffect` de cada página.
- `src/guards/auth.guard.tsx` (`AuthGuard`): decide si hay o no usuario
  logueado (`!!userState.token`). No revalida expiración (ya la hizo
  `getInitialUserState`) ni hace polling — para eso está el interceptor,
  que cierra sesión ante cualquier 401 en cualquier momento.
- `src/guards/rol.guard.tsx` (`RoleGuard`): recibe `roles: Roles[]` (no un
  solo `role`), para poder proteger una ruta que permite más de un rol:
  `<RoleGuard roles={[Roles.ADMIN, Roles.USER]} />`.
- `src/components/Header.tsx`: el menú privado (`DropdownMenu`) solo se
  muestra si hay token **y** la ruta actual no es pública. Si solo se
  chequea el token, un token viejo en `localStorage` hace que el menú
  aparezca un instante sobre la pantalla de login al recargar — bug real
  que ya se vio en siscofar-frontend, cuidado con reintroducirlo.

### Tailwind instalado, sin diseño (HISTÓRICO — ya no aplica: ver "Sistema de diseño" al principio)
Tailwind 4 está configurado (`@tailwindcss/vite` en `vite.config.ts`,
`@import "tailwindcss"` en `src/index.css`), pero **ningún componente tiene
`className` ni `style`**: la base no trae diseño, cada proyecto nuevo arma
el suyo. Ojo: el preflight de Tailwind resetea los estilos del navegador,
así que sin clases los botones se ven como texto plano y los títulos no
tienen tamaño. Es lo esperado, no un bug. Los componentes de
`components/ui/` (`Button`, `MenuToggleButton`, `SubmenuItem`) existen
para estilizarlos en un solo lugar ese día. El menú (`DropdownMenu`) es una
sola lista: antes tenía versiones de escritorio y mobile separadas solo por
clases (`md:hidden`). SweetAlert2 trae sus propios estilos internos, que
son parte de la librería, no de la base.

### Interfaces
`src/interfaces/index.ts` es un barrel — **los nombres de las interfaces
tienen que ser únicos entre archivos** (`GuardProps`, `RoleProps`,
`NotFoundProps`, no `Props` genérico repetido), porque un `export *`
duplicado no compila. Si se agrega una interfaz nueva de props, no llamarla
`Props` a secas.

## Convenciones de trabajo (heredadas de cómo trabaja este usuario)

- **Cambio mínimo necesario.** No proponer reescrituras grandes ni cambiar
  de librería/arquitectura sin que se pida explícitamente.
- Analizar antes de tocar, aplicar el cambio, **compilar y buildear
  después de cada modificación importante** (`npx tsc -b --noEmit` +
  `npx vite build`, y `npm run lint` si el cambio toca algo que el linter
  pueda opinar). No dar algo por terminado sin correr los tres.
- Nunca eliminar algo (`service`, `hook`, `componente`, export) solo porque
  "parece" no usarse — buscar referencias primero. (Así se encontraron los
  exports colgantes a `IngresoProductos`/`Admin/Profile.tsx`: nadie los
  había buscado, y tampoco nadie había buildeado el proyecto para que
  fallaran solos.)
- Entregar el código completo del archivo tocado, no fragmentos sueltos.
- Este proyecto **no tiene dominio de negocio propio** — a diferencia de
  siscofar-frontend, no hay que preservar nombres de campos, textos ni
  reglas de negocio de terceros. Lo que sí hay que preservar es la
  arquitectura de la sección anterior.

## Al arrancar un proyecto real a partir de esta base

1. Cambiar `VITE_API_BASE_URL` en `.env`.
2. Ajustar a la forma real del backend nuevo:
   - `src/interfaces/decode.token.interface.ts` (payload del JWT)
   - `src/models/user.model.ts` (`UserInfo`)
   - `src/interfaces/users.interface.ts` (`User`, lo que devuelve `/auth/profile`)
   - `src/services/auth.service.ts`, `profile.service.ts`, `register.service.ts`
     (rutas y forma de la respuesta del backend)
3. `src/models/roles.enum.ts` y `src/models/routes.ts`: reemplazar los
   roles/rutas de ejemplo (`ADMIN`/`USER`/`GUEST`) por los reales del
   proyecto nuevo.
4. Reemplazar las páginas de ejemplo (`pages/Private/Admin`, `User`,
   `Guest`, `Profile.tsx`) y el menú (`components/NavBars/DropdownMenu.tsx`,
   que todavía tiene links placeholder tipo `/admin/1`, `/link3`) por las
   páginas reales.
5. No hace falta tocar `src/api/axios.ts`, los guards, ni
   `redux/states/user.ts` salvo que el backend nuevo tenga un contrato de
   auth realmente distinto (ej. refresh tokens, cookies en vez de
   `Authorization` header).

## Estructura

```
src/
├─ api/axios.ts                        (instancia axios + interceptors — no tocar sin razón)
├─ components/
│  ├─ Header.tsx                       (chequea token + ruta pública)
│  ├─ Logout/Logout.tsx                (hook useLogout)
│  └─ NavBars/DropdownMenu.tsx         (menú — CONTENIDO DE EJEMPLO)
├─ guards/                             (AuthGuard, RoleGuard)
├─ interfaces/                         (barrel: @/interfaces — nombres únicos)
├─ models/                             (Roles, PublicRoutes/PrivateRoutes, UserInfo)
├─ pages/
│  ├─ Login/                           (Login.tsx + ResetPassword.tsx, públicas, sin estilar)
│  └─ Private/
│     ├─ NuevoUsuario/                 (alta de usuarios, solo ADMIN)
│     ├─ Profile.tsx                   (perfil — usa `User` = respuesta de /auth/profile)
│     └─ Admin|Recepcion|Medico/       (inicio por rol — provisorios hasta los paneles reales)
├─ redux/
│  ├─ states/user.ts                   (sesión: createUser/updateUser/resetUser + getInitialUserState)
│  └─ store.ts
├─ services/                           (auth [login + reset de clave], profile, register [alta ADMIN] — todos vía `api`, sin `token` param)
└─ utilities/
   ├─ apiUrl.utility.ts
   ├─ errors/getErrorMessage.utility.ts
   └─ alerts/ (alert.utils.ts, session-alerts.utils.ts)
```

## Estado de las herramientas

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc -b && vite build`. Limpio a la fecha de este archivo.
- `npm run lint` — ESLint 9, flat config (`eslint.config.js`). Limpio a la
  fecha de este archivo.
- Sin tests unitarios de frontend (no hay Jest/Vitest instalado); los flujos se verificaron de punta a punta en el navegador contra una base de demo. La lógica crítica (disponibilidad, permisos, doble reserva, acceso clínico) está testeada en el backend.
