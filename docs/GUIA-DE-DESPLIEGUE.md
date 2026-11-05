# Guía de despliegue de Turnero en un servidor propio (producción)

Cómo poner Turnero a funcionar en un servidor Linux (VPS) con **HTTPS**, nginx, servicio que se reinicia solo y **respaldos cifrados**. Está escrita para una persona que no es experta en servidores: cada paso dice qué hacer, qué tendría que pasar y qué mirar si no pasa.

> **Cómo leerla.** Los comandos se escriben en la terminal del servidor (por SSH). Las líneas que empiezan con `sudo` necesitan permisos de administrador. Todo lo que está entre `< >` es un **marcador**: hay que reemplazarlo por el dato real. Las claves y contraseñas **no están escritas en ningún archivo de esta guía**: se generan en el servidor (paso 5).
>
> **Estado de verificación** (sección 17): las migraciones, el arranque de la API, el primer administrador y la compilación se probaron de punta a punta. nginx, systemd y certbot están escritos según su documentación pero **no se pudieron ejecutar** al preparar esta guía: por eso cada paso termina con una comprobación.

## Índice

0. [Antes de empezar: datos que hacen falta](#0-antes-de-empezar-datos-que-hacen-falta)
1. [Cómo queda armado](#1-cómo-queda-armado-y-requisitos)
2. [Preparar el servidor](#2-preparar-el-servidor)
3. [Obtener el código](#3-obtener-el-código)
4. [Base de datos](#4-base-de-datos)
5. [Configurar el backend (.env)](#5-configurar-el-backend-env)
6. [Compilar el backend y crear las tablas](#6-compilar-el-backend-y-crear-las-tablas-migraciones)
7. [Servicio de la API (systemd)](#7-servicio-de-la-api-systemd)
8. [Reemplazar el dominio](#8-reemplazar-el-dominio-antes-de-publicar)
9. [Compilar y publicar la web](#9-compilar-y-publicar-la-web)
10. [nginx y certificado HTTPS](#10-nginx-y-certificado-https)
11. [Primer ingreso y configuración inicial](#11-primer-ingreso-y-configuración-inicial)
12. [Respaldos automáticos y cómo restaurar](#12-respaldos-automáticos-y-cómo-restaurar)
13. [Imagen para compartir el link](#13-imagen-para-compartir-el-link-og-imagepng)
14. [Checklist final de verificación](#14-checklist-final-de-verificación)
15. [Actualizar a una versión nueva](#15-actualizar-a-una-versión-nueva-y-volver-atrás)
16. [Si algo falla](#16-si-algo-falla)
17. [Qué se probó y qué no · avisos de seguridad](#17-qué-se-probó-y-qué-no--avisos-de-seguridad)
18. [Apéndice: variables de entorno](#18-apéndice-variables-de-entorno)

---

## 0. Antes de empezar: datos que hacen falta

Juntá esto antes de tocar el servidor. Lo que no esté, la guía deja un marcador.

| Dato | Para qué | Estado |
|---|---|---|
| **Dominio** (por ejemplo `turnos.miconsultorio.com.ar`) | HTTPS, links de los correos y de WhatsApp | Falta definir |
| **DNS**: el dominio apuntando a la **IP del servidor** (registro `A`) | Que certbot pueda emitir el certificado | Falta |
| **IP del servidor** y proveedor | Entrar por SSH | Falta |
| **Usuario administrador del servidor** (con `sudo`) y su clave SSH | Instalar y mantener | Falta |
| **Dirección del repositorio git** y, si es privado, una *deploy key* | Descargar el código | Falta |
| **Correo del consultorio** con SMTP (host, puerto, usuario y *clave de aplicación*) | Recuperar clave, comprobantes y recordatorios | Falta |
| **Nombre del consultorio** y teléfono | Se cargan en el panel (paso 11) | Falta |
| **Datos del responsable del aviso de privacidad** (razón social, domicilio, email, teléfono) | Reemplazar los `[COMPLETAR…]` del texto legal | Falta (con revisión del abogado) |
| **Imagen `og-image.png`** (1200×630 px, menos de 1 MB) | Vista previa del link en WhatsApp | Falta (paso 13) |
| **Titular de los respaldos**: quien guarda la clave privada | Restaurar respaldos | Falta (paso 12) |

---

## 1. Cómo queda armado y requisitos

```
 Internet ──► nginx (puertos 80 y 443, certificado HTTPS)
                │
                ├─ /            → la web (archivos en /var/www/turnero)
                ├─ /api/        → la API (127.0.0.1:3006, servicio turnero-api)
                ├─ /uploads/    → fotos de perfil (también de la API)
                └─ /api/.../stream → conexiones abiertas (llamador y paneles), sin buffer
 La API ──► MySQL (127.0.0.1:3306)       Respaldos cifrados → /var/backups/turnero (+ copia remota)
```

**La web y la API comparten el mismo dominio.** Eso simplifica todo: no hace falta configurar CORS y un solo certificado alcanza.

**Requisitos del servidor**

| Qué | Recomendado |
|---|---|
| Sistema | Debian 12/13 o Ubuntu 22.04/24.04 (LTS), 64 bits |
| Tamaño | 2 CPU, 2 GB de RAM, 20 GB de disco (los respaldos y las fotos crecen con el tiempo) |
| Node.js | **22 LTS** (el proyecto exige 22 o superior) |
| MySQL | **8.4** (no MariaDB) |
| nginx | el del sistema (1.22 en adelante; la configuración usa solo directivas viejas, anda en todas) |
| Otros | `certbot`, `git`, `rsync`, `curl`, `ufw` |

**Carpetas** (el resto de la guía y los respaldos suponen estas rutas):

| Ruta | Qué es |
|---|---|
| `/opt/turnero` | El proyecto descargado (`Backend/`, `Frontend/`, `docs/`) |
| `/opt/turnero/Backend/.env` | Configuración secreta de la API (permisos 640) |
| `/opt/turnero/Backend/uploads` | Fotos de perfil |
| `/opt/turnero/Backend/logs` | Registros de la API (se borran solos a los 60 días) |
| `/var/www/turnero` | La web ya compilada que sirve nginx |
| `/var/backups/turnero` | Respaldos cifrados |
| `/etc/turnero-backup` | Configuración de los respaldos |

---

## 2. Preparar el servidor

Entrá por SSH con tu usuario administrador.

**2.1 Actualizar y zona horaria**

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Argentina/Buenos_Aires
timedatectl | grep "Time zone"
```
La zona horaria hace que los respaldos de las 03:00 y los registros usen hora argentina. (La app guarda las fechas en hora de Argentina sin importar esto.)

**2.2 Paquetes**

```bash
sudo apt install -y nginx certbot git rsync curl ufw gzip
```
(El cliente de MySQL y `mysqldump`, que usan los respaldos, llegan con `mysql-server` en el paso 2.4.)

**2.3 Node.js 22**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh        # (opcional: leerlo antes con "less /tmp/nodesource_setup.sh")
sudo apt install -y nodejs
node -v          # tiene que decir v22.x
```

**2.4 MySQL 8.4**

Debian no trae MySQL (trae MariaDB) y Ubuntu trae la 8.0: hace falta el repositorio oficial de MySQL.

1. En https://dev.mysql.com/downloads/repo/apt/ copiá el link del archivo `mysql-apt-config_…_all.deb` y descargalo: `wget <LINK_DEL_ARCHIVO>`.
2. `sudo dpkg -i mysql-apt-config_*_all.deb` → en el menú elegí **mysql-8.4-lts** y *Ok*.
3. `sudo apt update && sudo apt install -y mysql-server`. Si pregunta la clave de `root`, poné una **larga y aleatoria** (`openssl rand -hex 24`) y guardala en un gestor de contraseñas.
4. `mysql --version` tiene que decir `8.4`.

Dejá MySQL escuchando solo en el propio servidor: en `/etc/mysql/mysql.conf.d/mysqld.cnf` (o `/etc/mysql/conf.d/`) tiene que figurar `bind-address = 127.0.0.1`, y agregá `sql_mode = STRICT_TRANS_TABLES`. Luego `sudo systemctl restart mysql`.

**2.5 Firewall** (esto importa: la API **escucha en todas las interfaces** y MySQL también podría; solo deben ser públicos SSH, 80 y 443)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```
No abras 3006 (API) ni 3306 (MySQL). Quedan accesibles solo desde el propio servidor, que es lo que se quiere.

---

## 3. Obtener el código

```bash
sudo useradd --system --create-home --home-dir /var/lib/turnero --shell /usr/sbin/nologin turnero
sudo install -d -o turnero -g turnero /opt/turnero
sudo -H -u turnero git clone <DIRECCION_DEL_REPOSITORIO> /opt/turnero
ls /opt/turnero            # tienen que verse Backend, Frontend y docs
```

`turnero` es el usuario con el que corre la API: no puede iniciar sesión y solo es dueño de esa carpeta. Todos los comandos con `sudo -H -u turnero` se ejecutan como ese usuario.

---

## 4. Base de datos

Entrá a MySQL como administrador (`sudo mysql` o `mysql -u root -p`) y ejecutá, **reemplazando la clave** por una generada con `openssl rand -hex 24` (guardala: va en el `.env` del paso 5):

```sql
CREATE DATABASE turnero CHARACTER SET utf8mb4;
CREATE USER 'turnero_app'@'localhost' IDENTIFIED BY '<CLAVE_DE_turnero_app>';
GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON turnero.* TO 'turnero_app'@'localhost';
```

El usuario de la app **no puede crear ni borrar tablas** a propósito: si alguien lograra atacar la API, no podría destruir la estructura. Las tablas las crea otra cuenta (`root`) solo en el paso 6, con la clave pasada en el momento (nunca guardada en un archivo).

Si `root` en tu MySQL entra solo con `sudo mysql` (sin clave), ponele una clave para poder usarla desde el programa de migraciones:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<CLAVE_DE_ROOT>';
```

---

## 5. Configurar el backend (.env)

```bash
cd /opt/turnero/Backend
sudo -H -u turnero cp ../docs/despliegue/backend.env.produccion.ejemplo .env
sudo chmod 640 .env
sudo nano .env
```

Completá el archivo siguiendo los comentarios que trae. Lo esencial:

| Variable | Qué poner |
|---|---|
| `DB_PASSWORD` | La clave de `turnero_app` del paso 4 |
| `SECRET_WORD` | Una clave nueva: `openssl rand -hex 32` |
| `TWO_FACTOR_KEY` | **Otra** clave nueva: `openssl rand -hex 32` (distinta de la anterior) |
| `FRONTEND_URL` | `https://<TU_DOMINIO>` (con https, sin barra al final) |
| `TRUST_PROXY` | `1` (ya viene así) |
| `JWT_EXPIRES_IN` | `10h` para cubrir una jornada (por defecto serían 3 h) |
| `MAIL_*` | Los datos del correo del consultorio |
| `SEED_ADMIN_*` | Usuario, correo y clave del **primer administrador** (se usan una sola vez, paso 11) |

**Comprobación obligatoria**: no puede quedar ningún marcador sin reemplazar (una clave olvidada como `<GENERAR_CLAVE_ALEATORIA>` se aceptaría como clave real):

```bash
grep -n '<' /opt/turnero/Backend/.env       # no tiene que mostrar NADA
stat -c '%U:%G %a' /opt/turnero/Backend/.env     # turnero:turnero 640
```

> **Muy importante:** `SECRET_WORD` y `TWO_FACTOR_KEY` no se pueden cambiar después sin consecuencias (sesiones cerradas, verificación en dos pasos y tokens de las pantallas ilegibles). Los respaldos guardan este archivo cifrado justamente por eso.

---

## 6. Compilar el backend y crear las tablas (migraciones)

```bash
cd /opt/turnero/Backend
sudo -H -u turnero npm ci
sudo -H -u turnero npm run build
sudo -H -u turnero npm prune --omit=dev        # opcional: saca las herramientas de desarrollo (menos espacio y menos superficie)
sudo install -d -o turnero -g turnero uploads uploads/avatars logs
```

Las **migraciones** crean las 26 tablas y los 24 *triggers* que hacen cumplir que una consulta finalizada no se modifica y que la auditoría no se borra. Necesitan una cuenta con permisos de estructura (`root`); la clave se pide en el momento y no queda guardada:

```bash
cd /opt/turnero/Backend
read -rs -p "Clave de root de MySQL: " ROOTPASS; echo
sudo -H -u turnero env MIGRATION_DB_USER=root MIGRATION_DB_PASSWORD="$ROOTPASS" npm run migration:run:prod
unset ROOTPASS
```

Tiene que terminar con `Migration WhatsappReminders1790770000000 has been executed successfully.` (son 23 migraciones en total). Comprobación:

```bash
mysql -u root -p -e "SELECT COUNT(*) AS migraciones FROM turnero.migrations;"      # 23
```

> Si `npm ci` falla compilando `argon2` (el módulo que cifra las claves), instalá `sudo apt install -y build-essential python3` y repetí.

---

## 7. Servicio de la API (systemd)

Para que la API arranque con el servidor y se reinicie sola si se cae:

```bash
sudo cp /opt/turnero/docs/despliegue/turnero-api.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/turnero-api.service     # no tiene que mostrar errores
sudo systemctl daemon-reload
sudo systemctl enable --now turnero-api
```

Comprobación (esperá unos 10 segundos):

```bash
systemctl is-active turnero-api                  # active
curl -s http://127.0.0.1:3006/api/health         # {"status":"ok"}
```

**Logs.** Dos lugares: `journalctl -u turnero-api -n 100 --no-pager` (y `-f` para verlos en vivo) y los archivos de `/opt/turnero/Backend/logs` (con rotación diaria, 60 días).

**Reinicio automático.** El servicio vuelve a arrancar a los 5 segundos de caerse. Si falla 5 veces seguidas en 2 minutos (por ejemplo, por un error en el `.env`), systemd deja de reintentar: se ve con `systemctl status turnero-api` y el motivo en `journalctl`.

> La API **no arranca** si falta una variable obligatoria o si no puede conectarse a MySQL (reintenta 9 veces en unos 30 segundos y se apaga con un mensaje claro). Es lo esperado: mirá `journalctl -u turnero-api`.

> Importante: corré **una sola copia** de la API. Los recordatorios de turno y los límites de intentos viven dentro de cada proceso.

---

## 8. Reemplazar el dominio (antes de publicar)

El dominio real tiene que reemplazar el marcador `DOMINIO-A-DEFINIR` en estos lugares:

| Dónde | Cómo |
|---|---|
| `Frontend/public/robots.txt` (línea `Sitemap:`) y `Frontend/public/sitemap.xml` | **Hacerlo en tu computadora, una sola vez, y commitearlo**: así queda en el repositorio y las actualizaciones no lo pisan. `sed -i 's/DOMINIO-A-DEFINIR/turnos.miconsultorio.com.ar/g' Frontend/public/robots.txt Frontend/public/sitemap.xml` |
| `Frontend/.env.production` (`VITE_API_BASE_URL`, `VITE_SITE_URL`) | Se crea en el servidor en el paso 9 (no va al repositorio) |
| `Backend/.env` (`FRONTEND_URL`) | Ya hecho en el paso 5 |
| `/etc/nginx/conf.d/turnero.conf` | Paso 10 |

Si ya hiciste el paso 3 antes de commitear el cambio de `robots.txt` y `sitemap.xml`, hacé un `sudo -H -u turnero git pull` en el servidor.

---

## 9. Compilar y publicar la web

La web usa tres datos que se **fijan al compilar** (por eso se compila con el dominio ya definido):

```bash
cd /opt/turnero/Frontend
sudo -H -u turnero cp ../docs/despliegue/frontend.env.produccion.ejemplo .env.production
sudo nano .env.production        # reemplazar DOMINIO-A-DEFINIR y <NOMBRE_DEL_CONSULTORIO>
grep -n 'DOMINIO-A-DEFINIR\|<' .env.production      # no tiene que mostrar NADA
```

`VITE_API_BASE_URL` tiene que ser una dirección completa terminada en `/api` (por ejemplo `https://turnos.miconsultorio.com.ar/api`); con `/api` a secas la compilación falla.

```bash
sudo -H -u turnero npm ci
sudo -H -u turnero npm run build
sudo install -d /var/www/turnero
sudo rsync -a --delete dist/ /var/www/turnero/
ls /var/www/turnero            # index.html, assets, robots.txt, sitemap.xml, favicon.svg
```

---

## 10. nginx y certificado HTTPS

nginx es la "puerta de entrada": maneja el certificado, redirige de HTTP a HTTPS, sirve la web y le pasa a la API lo que va a `/api`. Se hace en dos etapas porque certbot necesita el sitio funcionando por HTTP **antes** de poder emitir el certificado.

> Requisito: el **DNS** del dominio ya tiene que apuntar a la IP del servidor (`ping <TU_DOMINIO>` tiene que mostrar esa IP) y los puertos 80 y 443 abiertos (paso 2.5).

**10.1 Etapa A: solo HTTP, para obtener el certificado**

```bash
sudo mkdir -p /var/www/certbot /etc/nginx/snippets
sudo cp /opt/turnero/docs/despliegue/nginx-turnero-proxy.conf /etc/nginx/snippets/turnero-proxy.conf
sudo cp /opt/turnero/docs/despliegue/nginx-turnero-http-inicial.conf /etc/nginx/conf.d/turnero.conf
sudo sed -i 's/DOMINIO-A-DEFINIR/<TU_DOMINIO>/g' /etc/nginx/conf.d/turnero.conf
sudo rm -f /etc/nginx/sites-enabled/default           # el sitio de ejemplo de nginx
sudo nginx -t && sudo systemctl reload nginx
curl -i http://<TU_DOMINIO>                           # tiene que responder 200 "Turnero: configurando el certificado HTTPS."
```

**10.2 Certificado de Let's Encrypt** (es gratis y se renueva solo)

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d <TU_DOMINIO> \
     -m <TU_CORREO> --agree-tos --no-eff-email \
     --deploy-hook "systemctl reload nginx"
sudo ls /etc/letsencrypt/live/<TU_DOMINIO>/           # fullchain.pem y privkey.pem
sudo certbot renew --dry-run                          # tiene que terminar con "all simulated renewals succeeded"
```

El paquete `certbot` instala un temporizador que renueva solo (`systemctl list-timers | grep certbot`).

**10.3 Etapa B: la configuración completa**

```bash
sudo cp /opt/turnero/docs/despliegue/nginx-turnero.conf /etc/nginx/conf.d/turnero.conf
sudo sed -i 's/DOMINIO-A-DEFINIR/<TU_DOMINIO>/g' /etc/nginx/conf.d/turnero.conf
sudo nginx -t                  # tiene que decir "syntax is ok" y "test is successful"
sudo systemctl reload nginx
```

Si `nginx -t` marca un error, **no recargues**: el mensaje dice archivo y línea; lo más común es un `DOMINIO-A-DEFINIR` sin reemplazar o que el certificado no esté todavía.

**Qué hace esta configuración** (todo explicado dentro del archivo `docs/despliegue/nginx-turnero.conf`):

| Pedido | Resultado |
|---|---|
| `http://…` | Redirige (301) a `https://…` |
| `/api/…` | Va a la API. Límite de pedido: **1 MB**; la foto de perfil (`/api/auth/foto`) acepta hasta **6 MB**, porque la API admite 5 MB |
| `/api/display/stream`, `/api/doctor/agenda/stream`, `/api/admin/agenda/stream` | Conexiones abiertas del **llamador** y de los paneles: **sin buffer** (`proxy_buffering off`) y con espera larga; sin esto, el nombre del paciente llegaría tarde o nunca a la pantalla |
| `/uploads/…` | Fotos de perfil (las sirve la API) |
| `/`, `/mi-turno`, `/privacidad`, `/login`, `/pantalla`… y los paneles | La web (pantallas que **existen** en la app: devuelven 200) |
| Cualquier otra dirección (`/loquesea`) | **404 real** (código 404, no 200) mostrando la página "Esta página no existe" |
| `robots.txt`, `sitemap.xml`, `favicon.svg`, `og-image.png` | Los archivos reales |
| Cabeceras | HSTS (siempre HTTPS), anti-marcos, `nosniff`, sin referrer |

> **Si se agrega una pantalla nueva** en `Frontend/src/App.tsx`, hay que agregar su ruta a la lista de `nginx-turnero.conf`; si no, esa pantalla daría 404.
>
> **HSTS:** el navegador recuerda "este sitio es solo HTTPS" durante un año. Mientras probás, cambiá `max-age=31536000` por `max-age=300` (5 minutos) y subilo cuando todo ande.

**10.4 Comprobación**

```bash
curl -I http://<TU_DOMINIO>                      # 301 → https://<TU_DOMINIO>/
curl -I https://<TU_DOMINIO>                     # 200, strict-transport-security, content-type: text/html
curl -s https://<TU_DOMINIO>/api/health          # {"status":"ok"}
curl -I https://<TU_DOMINIO>/esta-no-existe      # 404
```

---

## 11. Primer ingreso y configuración inicial

1. Abrí `https://<TU_DOMINIO>/login` e ingresá con el usuario y la clave de `SEED_ADMIN_*`.
2. **Sacá las tres líneas `SEED_ADMIN_*` del `.env`** y reiniciá (así la clave inicial no queda guardada en el servidor):
   ```bash
   sudo nano /opt/turnero/Backend/.env          # borrar SEED_ADMIN_NICK, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD
   sudo systemctl restart turnero-api
   ```
3. En **Mi perfil**, cambiá la clave del administrador y activá la **verificación en dos pasos** (recomendado).
4. En **Administración → Configuración**: nombre del consultorio, teléfono, reserva online, anticipación para cancelar, recordatorios.
5. En **Administración → Configuración → Aviso de privacidad**: cargá el texto **real**, sin ningún `[COMPLETAR…]`, con los datos del responsable. Hasta que no se publique, los pacientes ven un borrador marcado "texto en revisión". Conviene que lo revise un abogado.
6. Cargá lo básico del consultorio: **especialidades, consultorios, obras sociales, usuarios** (recepción y médicos), **profesionales** (con matrícula y especialidades) y **horarios**.
7. **Pantalla del llamador**: en **Administración → Pantallas de sala**, creá una y abrí en la TV el enlace que muestra. Instalación y sonido en `GUIA-PANTALLA-SALA.md`.

---

## 12. Respaldos automáticos y cómo restaurar

Los respaldos **ya están hechos** en `Backend/ops/backup/` y se explican a fondo en **`Backend/ops/backup/RESPALDOS.md`**: leer esa guía completa antes de instalarlos. Resumen de lo que hacen y del orden de instalación:

- Cada día a las 03:00 (hora del servidor) se guarda la base completa, el `.env` y las fotos, **cifrados** con la clave pública de la clínica; la clave privada **no está nunca en el servidor**.
- Se conservan 14 diarios, 8 semanales, 12 mensuales y 1 por año. Si hay `REMOTE`, se copian fuera del servidor.
- Si falla un respaldo, o pasan más de 26 horas sin uno exitoso, llega un correo.

**Orden de instalación** (todo está detallado en `RESPALDOS.md`, sección 3):

1. 3.1: crear el usuario `turnero-backup` y las carpetas (`/var/backups/turnero`, `/etc/turnero-backup`).
2. 3.2: instalar `age` (verificando su SHA-256) y, si se usa copia remota, `rclone`.
3. 3.3: **el titular** genera el par de claves en **su** máquina y guarda la clave privada en dos lugares independientes. Al servidor solo va la clave pública.
4. 3.4: crear el usuario de MySQL de **solo lectura** (`setup-backup-user.sh`).
5. 3.5: completar `/etc/turnero-backup/backup.conf` (`ALERT_TO`, `REMOTE`, rutas de la app: ya coinciden con esta guía).
6. 3.6: primera corrida a mano y activar los temporizadores.

**Comprobación**: `ls -l /var/backups/turnero` muestra archivos `.age` con permisos 600 y `systemctl list-timers 'turnero-*'` muestra los dos temporizadores.

**Restaurar** (emergencia o simulacro): hace falta el archivo `turnero-*.sql.gz.age`, su `.manifest.json`, la clave privada y la clave de `root` de MySQL. `restore.sh` restaura **en una base nueva** (no toca la real) y verifica migraciones, triggers y huellas:

```bash
RESTORE_DB_USER=root RESTORE_DB_PASSWORD='<CLAVE_DE_ROOT>' \
  /opt/turnero/Backend/ops/backup/restore.sh \
    --file /ruta/turnero-AAAAMMDD-HHMMSS.sql.gz.age \
    --manifest /ruta/turnero-AAAAMMDD-HHMMSS.manifest.json \
    --identity /ruta/turnero-clave-privada.txt \
    --target-db turnero_restore_prueba
```
Tiene que terminar con `TODO BIEN`. La recuperación total en un servidor nuevo está en `RESPALDOS.md`, sección 5.1. **Hacé el simulacro al instalar y cada tres meses**: un respaldo que nunca se restauró no es un respaldo.

---

## 13. Imagen para compartir el link (`og-image.png`)

Cuando alguien comparte el link por WhatsApp, la vista previa usa `https://<TU_DOMINIO>/og-image.png`. **Todavía no existe esa imagen**: hasta crearla, la vista previa sale sin imagen.

- **Qué es:** una imagen **PNG o JPG de 1200 × 630 píxeles**, de **menos de 1 MB**.
- **Qué lleva:** el logo, el nombre del consultorio y la frase "Pedí tu turno online". Fondo liso y letras grandes (se ve chica en el celular).
- **Dónde va:** en `Frontend/public/og-image.png`, **commiteada en el repositorio**, y volver a compilar y publicar la web (paso 9 o 15).
- **Comprobar:** `curl -I https://<TU_DOMINIO>/og-image.png` tiene que responder `200` con `content-type: image/png`. Para ver cómo se ve compartida, pegá el link en WhatsApp (puede tardar: WhatsApp guarda la vista previa anterior).

---

## 14. Checklist final de verificación

Después de desplegar, comprobá **todo** esto. Si algo falla, pasá a la sección 16.

| # | Qué comprobar | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Candado HTTPS | `curl -I https://<TU_DOMINIO>` | `200` y cabecera `strict-transport-security` |
| 2 | HTTP pasa a HTTPS | `curl -I http://<TU_DOMINIO>` | `301` con `location: https://…` |
| 3 | Renovación del certificado | `sudo certbot renew --dry-run` | `all simulated renewals succeeded` |
| 4 | API viva | `curl -s https://<TU_DOMINIO>/api/health` | `{"status":"ok"}` |
| 5 | La API **no** se ve desde afuera | Desde **otra** máquina: `curl -m 5 http://<IP_DEL_SERVIDOR>:3006/api/health` | No responde |
| 6 | MySQL **no** se ve desde afuera | Desde otra máquina: `nc -zv -w 5 <IP_DEL_SERVIDOR> 3306` | Falla / no conecta |
| 7 | Una sola cabecera de seguridad | `curl -sI https://<TU_DOMINIO>/api/health \| grep -ci strict-transport` | `1` |
| 8 | 404 real | `curl -I https://<TU_DOMINIO>/esta-no-existe` y `curl -I https://<TU_DOMINIO>/mi-turno` | `404` y `200` |
| 9 | robots y sitemap | `curl https://<TU_DOMINIO>/robots.txt` y `/sitemap.xml` | Texto/XML real con **tu dominio** (sin `DOMINIO-A-DEFINIR`) |
| 10 | Login | Entrar al panel con cada rol (administración, recepción, médico) | Entra; el panel de cada rol muestra solo lo suyo |
| 11 | **Reservar un turno** | Desde un celular, en `https://<TU_DOMINIO>`, sacar un turno de prueba | Aparece el comprobante con el código, el botón de WhatsApp y llega el **correo**; después cancelarlo desde **Mi turno** |
| 12 | Tiempo real | Con dos navegadores: recepción marca "Llegó" | El panel del médico muestra el botón sin recargar |
| 13 | **Llamador** | Abrir la pantalla de sala y, como médico, tocar **Llamar** | Aparece el nombre y el consultorio, suena el timbre y se dice dos veces |
| 14 | Conexión abierta sin buffer | `curl -N -H "Authorization: Bearer <TOKEN_DE_LA_PANTALLA>" https://<TU_DOMINIO>/api/display/stream` | Empiezan a aparecer líneas `event:` / `data:` **al instante** (no esperar). Cortar con Ctrl+C |
| 15 | Foto de perfil | Subir una foto de 3 MB y probar una de 7 MB | La de 3 MB se guarda; la de 7 MB da error (`413`) |
| 16 | Recuperar clave | "¿Olvidaste tu clave?" con un usuario que tenga correo | Llega el correo con el link y el link abre bien |
| 17 | La API se reinicia sola | `sudo systemctl kill -s KILL turnero-api; sleep 8; systemctl is-active turnero-api` | `active` |
| 18 | Todo vuelve tras reiniciar el servidor | `sudo reboot` y, al volver, repetir 4 y 13 | Funciona sin tocar nada |
| 19 | Respaldo | Correr el respaldo a mano y `ls -l /var/backups/turnero` | Archivos `.age` con permisos 600; temporizadores activos |
| 20 | **Simulacro de restauración** | Sección 12 | `TODO BIEN` |
| 21 | Dependencias | `cd /opt/turnero/Backend && npm audit --omit=dev` y lo mismo en `Frontend` | Sin vulnerabilidades altas ni críticas (o anotar las conocidas y su motivo) |
| 22 | Aviso de privacidad | Abrir `https://<TU_DOMINIO>/privacidad` | Texto final, **sin `[COMPLETAR`** |
| 23 | Vista previa del link | Pegar el link en WhatsApp | Título, texto e imagen (paso 13) |
| 24 | Sin claves olvidadas | `grep -n '<' /opt/turnero/Backend/.env` y `grep -c SEED_ADMIN /opt/turnero/Backend/.env` | Nada y `0` |

### Pruebas automáticas de `Backend/qa/` (¡NO en producción!)

La carpeta `Backend/qa/` (cuando esté incorporada al repositorio) trae pruebas que **crean usuarios, pacientes y turnos de prueba** y **no se pueden borrar** (la base es de solo agregar). **No las corras contra la base real.** Se corren sobre una **copia de pruebas**:

```bash
# 1. base de pruebas y una segunda API en otro puerto (la API real no se toca)
mysql -u root -p -e "CREATE DATABASE turnero_pruebas CHARACTER SET utf8mb4; GRANT SELECT, INSERT, UPDATE, DELETE, LOCK TABLES ON turnero_pruebas.* TO 'turnero_app'@'localhost';"
cd /opt/turnero/Backend
read -rs -p "Clave de root de MySQL: " ROOTPASS; echo
sudo -H -u turnero env DB_NAME=turnero_pruebas MIGRATION_DB_USER=root MIGRATION_DB_PASSWORD="$ROOTPASS" npm run migration:run:prod
# 2. segunda API con un administrador de prueba (en otra terminal; Ctrl+C la detiene)
sudo -H -u turnero env PORT=3098 DB_NAME=turnero_pruebas DISABLE_SCHEDULED_JOBS=true \
     SEED_ADMIN_NICK=qa_admin SEED_ADMIN_PASSWORD='<CLAVE_DE_PRUEBA>' node dist/main
# 3. las pruebas, apuntando a esa API
QA_API_URL=http://localhost:3098/api QA_ADMIN_USER=qa_admin QA_ADMIN_PASSWORD='<CLAVE_DE_PRUEBA>' node qa/seed-test-users.mjs
QA_API_URL=http://localhost:3098/api node --test qa/api-blackbox.test.mjs
# 4. al terminar, borrar la base de pruebas
mysql -u root -p -e "DROP DATABASE turnero_pruebas;"
```
Las pruebas de interfaz (`qa/ui`) se corren desde una computadora de desarrollo, no desde el servidor.

---

## 15. Actualizar a una versión nueva (y volver atrás)

```bash
cd /opt/turnero
# 1. respaldo ANTES de tocar nada (si algo sale mal, se vuelve a este punto)
sudo -u turnero-backup -g turnero /opt/turnero/Backend/ops/backup/backup.sh
# 2. bajar la versión nueva
sudo -H -u turnero git pull
# 3. backend: compilar, migrar y reiniciar
cd Backend
sudo -H -u turnero npm ci && sudo -H -u turnero npm run build
read -rs -p "Clave de root de MySQL: " ROOTPASS; echo
sudo -H -u turnero env MIGRATION_DB_USER=root MIGRATION_DB_PASSWORD="$ROOTPASS" npm run migration:run:prod; unset ROOTPASS
sudo systemctl restart turnero-api
# 4. web: compilar y publicar
cd ../Frontend
sudo -H -u turnero npm ci && sudo -H -u turnero npm run build
sudo rsync -a --delete dist/ /var/www/turnero/
# 5. comprobar
curl -s https://<TU_DOMINIO>/api/health
```
Si la versión nueva trae rutas nuevas en `Frontend/src/App.tsx`, actualizá también `nginx-turnero.conf` (sección 10) y `sudo nginx -t && sudo systemctl reload nginx`.

**Volver atrás:** `git checkout <COMMIT_ANTERIOR>` y repetir 3 y 4. Si esa actualización **corrió migraciones**, volver el código no deshace los cambios de la base: restaurá el respaldo del punto 1 (sección 12) en lugar de improvisar.

---

## 16. Si algo falla

| Síntoma | Qué mirar |
|---|---|
| `nginx -t` marca error | Dice archivo y línea. Lo más común: `DOMINIO-A-DEFINIR` sin reemplazar, certificado todavía inexistente (hacer primero la etapa A), o falta `/etc/nginx/snippets/turnero-proxy.conf` |
| certbot no emite el certificado | El DNS tiene que apuntar a esta IP y el puerto 80 estar abierto (`sudo ufw status`). Probar `curl -i http://<TU_DOMINIO>/.well-known/acme-challenge/prueba` (da 404, pero tiene que llegar a nginx) |
| `502 Bad Gateway` en `/api` | La API no está corriendo: `systemctl status turnero-api` y `journalctl -u turnero-api -n 100` |
| El servicio no arranca (`systemctl status turnero-api`) | `journalctl -u turnero-api`: falta una variable del `.env`, la clave de `turnero_app` no coincide, MySQL caído, o no existen `uploads` y `logs` (paso 6) |
| `Config validation error` | Falta una variable obligatoria en el `.env` (`DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `SECRET_WORD` con 16 caracteres o más) |
| `Access denied for user 'turnero_app'` | La clave del `.env` no es la del paso 4, o falta el `GRANT` |
| La web carga pero "no hay conexión" | `VITE_API_BASE_URL` mal escrita al compilar: corregir `.env.production` y repetir el paso 9 |
| Una pantalla da 404 | La ruta no está en la lista de `nginx-turnero.conf` (sección 10.3) |
| El llamador no muestra el nombre | Revisar el punto 14 de la checklist (buffer) y que el token de la pantalla siga vigente |
| Todos los usuarios "se bloquean juntos" por intentos | Falta `TRUST_PROXY=1` en el `.env` (la API ve siempre la IP de nginx) |
| No llegan correos | `MAIL_*` mal o incompletos; `journalctl -u turnero-api \| grep -i mail`. Para Gmail hace falta una *clave de aplicación*, no la clave normal |
| La foto de perfil da error `413` | Pesa más de 5 MB (la API la rechaza) |

---

## 17. Qué se probó y qué no · avisos de seguridad

**Probado de punta a punta** (en la computadora de desarrollo, Windows):
- `npm run migration:run:prod` sobre una base vacía: 23 migraciones, 26 tablas y 24 triggers.
- Arranque con `node dist/main`, creación del primer administrador con `SEED_ADMIN_*` y login.
- Arranque de la API con **solo las dependencias de producción** (`npm ci --omit=dev`) y `migration:show` con ellas.
- Compilación de la web con las variables de esta guía (política CSP con tu dominio, `og:url`, `robots.txt` y `sitemap.xml` dentro de `dist`).

**Escrito según la documentación, pero no ejecutado** (no hay nginx, systemd ni certbot en la máquina de desarrollo): `nginx-turnero.conf` y sus archivos auxiliares, `turnero-api.service`, certbot, `ufw` y la instalación de MySQL 8.4. Por eso **cada paso termina con una comprobación** y conviene correr `sudo nginx -t` y `sudo systemd-analyze verify` antes de recargar. Los temporizadores de respaldos tienen el mismo aviso en `RESPALDOS.md`, sección 8.

**Avisos de seguridad**
- **La API escucha en todas las interfaces** (`0.0.0.0:3006`), no solo en `127.0.0.1`, y no hay variable para cambiarlo. Por eso el **firewall del paso 2.5 es obligatorio** y la checklist (punto 5) lo comprueba. Lo ideal es que la API escuche solo en `127.0.0.1`: queda anotado como mejora pendiente del código (hoy `main.ts` no permite elegir la interfaz).
- No abrir los puertos 3006 ni 3306.
- Las claves del `.env` no se cambian a la ligera (ver paso 5).
- Una sola copia de la API (ver paso 7).
- Las pruebas de `qa/` no van contra la base real (ver sección 14).

---

## 18. Apéndice: variables de entorno

### Backend (`/opt/turnero/Backend/.env`)

| Variable | Obligatoria | Qué es / valor en producción |
|---|---|---|
| `DB_TYPE` | no | `mysql` |
| `DB_HOST` | **sí** | `127.0.0.1` |
| `DB_PORT` | no | `3306` |
| `DB_NAME` | **sí** | `turnero` |
| `DB_USERNAME` | **sí** | `turnero_app` (nunca `root`) |
| `DB_PASSWORD` | **sí** | Clave de `turnero_app` |
| `SECRET_WORD` | **sí** | Firma las sesiones, mínimo 16 caracteres |
| `TWO_FACTOR_KEY` | recomendada | Cifra los secretos de 2FA y los tokens de pantalla (mínimo 16); si falta se deriva de `SECRET_WORD` |
| `JWT_EXPIRES_IN` | no | Duración de la sesión: `90m`, `10h`, `1d` (por defecto `3h`) |
| `PORT` | no | `3006` |
| `FRONTEND_URL` | recomendada | `https://<TU_DOMINIO>` sin barra final: links de correos y avisos, y origen CORS |
| `CORS_ORIGIN` | no | Vacío (web y API en el mismo dominio) |
| `TRUST_PROXY` | **sí, con nginx** | `1` |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_NAME` | para correos | SMTP del consultorio |
| `DISABLE_SCHEDULED_JOBS` | no | **Vacío** en producción (apaga los recordatorios) |
| `SEED_ADMIN_NICK`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | solo el primer arranque | Crean el primer administrador; **borrarlas después** |
| `MIGRATION_DB_USER`, `MIGRATION_DB_PASSWORD` | solo al migrar | Cuenta con permisos de estructura; **se pasan en el momento, no se guardan en el `.env`** |

### Frontend (`/opt/turnero/Frontend/.env.production`, solo al compilar)

| Variable | Obligatoria | Qué es |
|---|---|---|
| `VITE_API_BASE_URL` | **sí** | `https://<TU_DOMINIO>/api` (completa) |
| `VITE_SITE_URL` | recomendada | `https://<TU_DOMINIO>` sin barra final (vista previa de links) |
| `VITE_CLINIC_NAME` | no | Nombre de respaldo del consultorio (el real se cambia en el panel) |

### Archivos de esta guía (`docs/despliegue/`)

| Archivo | Se instala como |
|---|---|
| `backend.env.produccion.ejemplo` | `/opt/turnero/Backend/.env` |
| `frontend.env.produccion.ejemplo` | `/opt/turnero/Frontend/.env.production` |
| `turnero-api.service` | `/etc/systemd/system/turnero-api.service` |
| `nginx-turnero-http-inicial.conf` | `/etc/nginx/conf.d/turnero.conf` (etapa A, solo para el certificado) |
| `nginx-turnero.conf` | `/etc/nginx/conf.d/turnero.conf` (etapa B, definitivo) |
| `nginx-turnero-proxy.conf` | `/etc/nginx/snippets/turnero-proxy.conf` |
