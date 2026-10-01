# base-auth-react

Base de React + TypeScript + Vite para arrancar proyectos nuevos con
autenticación, manejo de sesión y llamadas HTTP ya resueltos.

## Qué incluye

### Alias `@/`
`@/` apunta a `src/` (configurado en `vite.config.ts` y en `tsconfig.app.json`
→ `compilerOptions.paths`). Usar siempre el alias para imports que cruzan de
un módulo a otro (`@/models`, `@/services`, `@/utilities/...`); dentro de un
mismo módulo (ej. entre dos componentes de `src/components/`), una ruta
relativa corta está bien.

### Cliente HTTP centralizado (`src/api/axios.ts`)
Instancia única de axios (`api`) usada por todos los services:
- Interceptor de **request**: agrega `Authorization: Bearer <token>`
  automáticamente leyendo el usuario de `localStorage`. Los services **no
  reciben `token` como parámetro**.
- Interceptor de **response**:
  - `401` → limpia la sesión y redirige a `/login`.
  - Sin respuesta del servidor (caído, sin red) → limpia la sesión, avisa
    con un `Swal` (`servidorNoDisponibleAlert`, en
    `src/utilities/alerts/session-alerts.utils.ts`) y redirige a `/login`.
  - Cualquier otro error se normaliza a un `Error` con `.message` (tomado de
    `error.response?.data?.message`), así el consumidor nunca necesita leer
    `error.response.data.message` a mano.

### Manejo de errores y alertas
- `src/utilities/errors/getErrorMessage.utility.ts` → `getErrorMessage(error)`.
  Usar en todo `catch` en vez de `error.message` a mano.
- `src/utilities/alerts/alert.utils.ts` → `showSuccess` / `showError`
  (wrappers de SweetAlert2). Agregar alertas de negocio propias del proyecto
  en un archivo aparte (no tocar `session-alerts.utils.ts`, que es del
  interceptor).

### Sesión y seguridad de páginas
- `src/redux/states/user.ts` → al hidratar el store desde `localStorage`,
  `getInitialUserState()` valida que el token no esté vencido (decodificando
  el JWT) antes de restaurar la sesión. Si expiró, arranca en sesión vacía
  en vez de quedar "logueado" sin poder pedir nada al backend.
- `src/guards/auth.guard.tsx` (`AuthGuard`) → protege rutas privadas según
  si hay `token` en el store. No repite la validación de expiración (ya la
  hace `getInitialUserState`); el interceptor se encarga de cerrar sesión
  ante un 401 en cualquier momento.
- `src/guards/rol.guard.tsx` (`RoleGuard`) → protege rutas por rol, acepta
  varios roles: `<RoleGuard roles={[Roles.ADMIN, Roles.USER]} />`.
- `src/components/Header.tsx` → el menú privado solo se muestra si hay
  token **y** la ruta actual no es pública (evita que el menú aparezca un
  instante sobre el login con una sesión vieja).

## Variables de entorno

```
VITE_API_BASE_URL=http://localhost:3006/api
```

## Estructura relevante

```
src/
├─ api/axios.ts                  (instancia de axios + interceptors)
├─ guards/                       (AuthGuard, RoleGuard)
├─ interfaces/                   (barrel: @/interfaces)
├─ models/                       (Roles, rutas públicas/privadas, UserInfo)
├─ redux/states/user.ts          (sesión: createUser/updateUser/resetUser)
├─ services/                     (auth, profile, register — todos vía `api`)
└─ utilities/
   ├─ apiUrl.utility.ts
   ├─ errors/getErrorMessage.utility.ts
   └─ alerts/ (alert.utils.ts, session-alerts.utils.ts)
```

## Al arrancar un proyecto nuevo desde esta base

- Cambiar `VITE_API_BASE_URL` en `.env`.
- Ajustar `src/interfaces/decode.token.interface.ts`, `src/models/user.model.ts`
  y `src/services/auth.service.ts` a la forma real del token/usuario del
  backend nuevo.
- El menú (`src/components/NavBars/DropdownMenu.tsx`) y las páginas de
  `src/pages/Private/` son solo de ejemplo — reemplazarlas por las del
  proyecto.
