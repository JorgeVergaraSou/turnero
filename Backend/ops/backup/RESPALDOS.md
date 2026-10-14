# Respaldos de Turnero

Respaldos **cifrados**, programados, con **copia fuera del servidor** y una restauración que se **prueba de verdad**. Pensado para un VPS Linux (Debian/Ubuntu) con MySQL 8.4.

> **Regla de oro:** un respaldo que nunca se restauró no es un respaldo. Hacer el simulacro de la sección 6 al instalar y cada tres meses.

## 1. Qué se respalda

| Qué | Cómo queda | Por qué |
|---|---|---|
| La base `turnero` completa (datos, esquema y los **triggers** que impiden modificar consultas finalizadas, auditoría y constancias) | `turnero-AAAAMMDD-HHMMSS.sql.gz.age` | Es la historia clínica y todo lo demás |
| El `.env` de la app | `env-AAAAMMDD-HHMMSS.age` | `SECRET_WORD` / `TWO_FACTOR_KEY` cifran los secretos de 2FA y los tokens de las pantallas. **Sin esa clave no se pueden leer: los usuarios con 2FA quedan afuera** |
| Fotos de perfil (`uploads/`) | `uploads-AAAAMMDD-HHMMSS.tar.gz.age` | Poco valor, casi gratis |
| Manifiesto | `turnero-AAAAMMDD-HHMMSS.manifest.json` | Huella SHA-256 del archivo, versión de MySQL, última migración y cantidad de registros (no lleva datos) |

Todo sale **cifrado con age** a una clave pública. El SQL en claro **nunca se escribe en el disco** (va en tubería: `mysqldump | gzip | age`).

## 2. Cómo está pensado

- **Usuario de MySQL propio y de solo lectura** (`turnero_backup`): `SELECT`, `SHOW VIEW` y `TRIGGER` y nada más. No es `root` ni el usuario de la app. Solo entra desde el propio servidor.
- **Clave pública en el servidor, clave privada afuera.** Quien entre al servidor puede *crear* respaldos pero **no leer los que ya existen**. La clave privada la guarda el titular (sección 4).
- **Rotación** (`dist/backup/rotate.js`): de cada grupo se conserva el respaldo más nuevo: 14 días, 8 semanas, 12 meses, **y uno por año para siempre**. No borra nada si el último respaldo no fue exitoso.
- **Copia fuera del servidor** con `rclone`, ya cifrada: el proveedor no ve nada. Se verifica tamaño y huella antes de dar el respaldo por bueno.
- **Alertas** por email (SMTP de la app) si falla; un chequeo aparte avisa si pasaron más de 26 horas sin un respaldo exitoso (cubre el caso "el timer no corrió"). Opcional: ping a un monitoreo externo para el caso "el servidor entero se cayó".
- **La retención legal de la historia clínica no depende de estos respaldos**: la base es la fuente. Los respaldos sirven para recuperar ante una falla, un error humano o un ataque.

## 3. Instalación en un VPS Linux

Todo como `root` (o con `sudo`). Reemplazar `cliente-x` y las rutas según la instalación.

### 3.1 Usuario del sistema y carpetas

```bash
useradd --system --home-dir /var/lib/turnero-backup --create-home --shell /usr/sbin/nologin turnero-backup
usermod -aG turnero turnero-backup            # "turnero" = grupo de la app; necesita leer su .env
chmod 640 /opt/turnero/Backend/.env           # dueño: la app, grupo: turnero
install -d -m 700 -o turnero-backup -g turnero-backup /var/backups/turnero
install -d -m 750 -o root -g turnero-backup /etc/turnero-backup
```

### 3.2 Programas (age, rclone, cliente de MySQL)

```bash
apt install -y mysql-client gzip      # mysqldump y mysql
```

**age** (descargar de https://github.com/FiloSottile/age/releases y **verificar el SHA-256** que publica la página del release):

```bash
curl -fsSL -o /tmp/age.tgz https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz
echo "cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10  /tmp/age.tgz" | sha256sum -c -
tar -xzf /tmp/age.tgz -C /tmp && install -m 755 /tmp/age/age /tmp/age/age-keygen /usr/local/bin/
age --version
```

**rclone** (solo si hay copia fuera del servidor): `apt install rclone` o el instalador oficial de rclone.org. Configurar el destino como el usuario de respaldos con un archivo propio:

```bash
sudo -u turnero-backup RCLONE_CONFIG=/etc/turnero-backup/rclone.conf rclone config
chmod 640 /etc/turnero-backup/rclone.conf && chown root:turnero-backup /etc/turnero-backup/rclone.conf
```

> Para el bucket remoto crear una credencial que **pueda subir pero no borrar ni sobreescribir** (en Backblaze B2 y S3 se hace con permisos de la clave). Así, un servidor comprometido no puede destruir las copias. La retención remota la maneja una regla del propio bucket.

### 3.3 Claves de cifrado (se hace en la máquina del TITULAR, no en el servidor)

```bash
age-keygen -o turnero-clave-privada.txt        # muestra la clave pública: "age1...."
```

1. **Guardar `turnero-clave-privada.txt` fuera del servidor y fuera de la carpeta de respaldos**: gestor de contraseñas **y** una copia impresa en un lugar seguro (ver sección 4).
2. Copiar al servidor **solo la línea pública** (`age1...`):

```bash
echo "age1....la-clave-publica...." > /etc/turnero-backup/recipients.txt
chown root:turnero-backup /etc/turnero-backup/recipients.txt && chmod 640 /etc/turnero-backup/recipients.txt
```

Se puede agregar **un segundo destinatario** (otra línea `age1...`): cualquiera de las dos claves privadas descifra.

### 3.4 Usuario de MySQL de solo lectura

```bash
ADMIN_DB_USER=root ADMIN_DB_PASSWORD='(la clave de root, solo para este comando)' \
  /opt/turnero/Backend/ops/backup/setup-backup-user.sh \
  --db turnero --cnf /etc/turnero-backup/mysql.cnf
chown root:turnero-backup /etc/turnero-backup/mysql.cnf && chmod 640 /etc/turnero-backup/mysql.cnf
```

Genera una clave larga y aleatoria, crea `turnero_backup@localhost` con `SELECT, SHOW VIEW, TRIGGER` sobre esa base, y escribe el archivo de credenciales. Correrlo de nuevo **rota la clave**.

### 3.5 Configuración

```bash
cp /opt/turnero/Backend/ops/backup/backup.conf.example /etc/turnero-backup/backup.conf
nano /etc/turnero-backup/backup.conf         # DB_NAME, BACKUP_DIR, APP_DIR, REMOTE, ALERT_TO, ...
chown root:turnero-backup /etc/turnero-backup/backup.conf && chmod 640 /etc/turnero-backup/backup.conf
chmod +x /opt/turnero/Backend/ops/backup/*.sh
```

La app tiene que estar compilada (`npm run build`): los scripts usan `dist/backup/*.js`.

### 3.6 Primera corrida a mano y programación

```bash
sudo -u turnero-backup -g turnero /opt/turnero/Backend/ops/backup/backup.sh
ls -l /var/backups/turnero                    # 3-4 archivos .age + manifiesto, permisos 600
cp /opt/turnero/Backend/ops/backup/systemd/*.{service,timer} /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/turnero-backup*.service /etc/systemd/system/turnero-backup*.timer
systemctl daemon-reload
systemctl enable --now turnero-backup.timer turnero-backup-check.timer
systemctl list-timers 'turnero-*'             # tienen que figurar los dos
```

Ver los resultados: `journalctl -u turnero-backup -n 50`.

> Si `/var/backups/turnero` o la ruta de la app son otras, ajustar `ReadWritePaths=` y `ExecStart=` en los `.service`.

### 3.7 Respaldo antes de cambiar el esquema

Antes de cada `migration:run` en producción: `sudo -u turnero-backup -g turnero /opt/turnero/Backend/ops/backup/backup.sh`. Si la migración sale mal, se vuelve a este punto.

## 4. Custodia de la clave privada (lo más importante)

- **Sin la clave privada los respaldos no se pueden abrir. No hay forma de recuperarla**: no existe una "clave maestra" ni un reseteo.
- Guardarla en **al menos dos lugares independientes**: gestor de contraseñas del titular y una copia **impresa** (o en un pendrive) en una caja fuerte o con una persona de confianza.
- Para que no dependa de una sola persona: agregar un **segundo destinatario** (por ejemplo, el estudio jurídico o el contador) con su propio par de claves.
- **Nunca** en el servidor, en la carpeta de respaldos, en el repositorio ni por email.
- Si se sospecha que se filtró: generar un par nuevo, reemplazar `recipients.txt`, hacer un respaldo nuevo y **borrar los viejos** (los viejos siguen abriéndose con la clave filtrada).
- El `.env` respaldado (`env-*.age`) contiene claves de la app: abrirlo solo en la restauración y borrar el descifrado después.

## 5. Restauración (de emergencia o simulacro)

Hace falta: el archivo `turnero-*.sql.gz.age` **y su `.manifest.json`**, la clave privada, y una cuenta de MySQL que pueda crear bases y triggers (root). `restore.sh` **restaura en una base nueva** y no toca la real salvo orden explícita.

```bash
RESTORE_DB_USER=root RESTORE_DB_PASSWORD='...' \
  /opt/turnero/Backend/ops/backup/restore.sh \
    --file /ruta/turnero-20261007-030000.sql.gz.age \
    --manifest /ruta/turnero-20261007-030000.manifest.json \
    --identity /ruta/turnero-clave-privada.txt \
    --target-db turnero_restore_prueba
```

Qué hace: comprueba la huella contra el manifiesto, descifra y confirma que el volcado esté completo (si no, **no toca ninguna base**), crea la base, carga y **verifica**:

| Control | Qué prueba |
|---|---|
| Migraciones | Las aplicadas son las del repositorio |
| Triggers | Existen los 24 que protegen los registros inmutables |
| Los triggers funcionan | Intenta modificar una consulta finalizada, borrar auditoría y alterar un aviso: la base tiene que rechazarlo (se revierte siempre) |
| Huellas | Recalcula el SHA-256 de **todas** las consultas finalizadas y lo compara con el guardado |
| Cantidad de registros | Las tablas que solo crecen tienen la cantidad que había al respaldar |
| Relaciones | Ninguna fila huérfana (el volcado restaura con las claves foráneas apagadas) |

Termina con **código 0 solo si todo está bien**. Si dice `FALLÓ`, **no usar esa restauración** sin revisar.

### 5.1 Recuperación total (servidor nuevo)

1. Instalar MySQL 8.4, Node y la app (sección 3, hasta 3.2), y compilar (`npm run build`).
2. Traer del almacenamiento remoto el último conjunto: `turnero-*.sql.gz.age`, su manifiesto y `env-*.age`.
3. Descifrar el `.env`: `age -d -i clave-privada.txt env-AAAAMMDD-HHMMSS.age > /opt/turnero/Backend/.env` (permisos 640). **Sin este paso los secretos de 2FA no se pueden leer.**
4. Restaurar en una base de prueba con `restore.sh` (arriba) y revisar el resultado.
5. Crear el usuario de la app (`turnero_app`, sin DDL) y apuntar la app a la base restaurada: o bien restaurar directo con el nombre real usando `--target-db turnero --confirm-overwrite turnero` (**borra lo que haya en esa base**; en un servidor nuevo no hay nada), o cambiar `DB_NAME` en el `.env`.
6. Si el respaldo es de una versión anterior del código, el verificador avisa "faltan migraciones": correr `migration:run`.
7. Recrear el usuario de respaldo (3.4) y la programación (3.6).

Los triggers se restauran con su `DEFINER` original (`root@localhost`): hay que restaurar con una cuenta con privilegio de crear triggers (root), como indica el comando.

## 6. Simulacro (probar que se puede recuperar)

Al instalar y **cada tres meses**, con la clave privada, desde una máquina que NO sea el servidor de producción si es posible:

1. Traer un respaldo **desde la copia remota** (no el local): prueba también la copia.
2. `restore.sh` como en la sección 5 → tiene que terminar en `TODO BIEN`.
3. Anotar fecha, quién lo hizo y el resultado en la checklist (sección 9).

La prueba automática completa (la que corre el equipo de desarrollo al cambiar el esquema) es `ops/backup/test-restore.sh`: arma claves descartables, hace un respaldo real, lo restaura, verifica, y comprueba los casos que **tienen** que fallar (clave equivocada, archivo dañado o cortado, base alterada, permisos del usuario de respaldo, rotación, fallo del respaldo, copia remota).

```bash
ADMIN_DB_USER=root ADMIN_DB_PASSWORD='...' AGE_BIN=... AGE_KEYGEN_BIN=... [RCLONE_BIN=...] \
  ops/backup/test-restore.sh --db turnero_e2e
```

## 7. Si llega una alerta

| Mensaje | Qué hacer |
|---|---|
| "El respaldo del … falló" | `journalctl -u turnero-backup -n 100`. Causas típicas: disco lleno, MySQL caído, el destino remoto no responde, la clave de `turnero_backup` cambió (volver a correr `setup-backup-user.sh`) |
| "El último respaldo exitoso tiene N horas" | El timer no corrió o el respaldo falla: `systemctl list-timers 'turnero-*'` y el journal |
| "No hay registro de ningún respaldo" | Es una instalación nueva o se borró `BACKUP_DIR`: correr el respaldo a mano |
| Ping del monitoreo externo sin llegar | El servidor entero no responde: revisar el VPS |

Mientras no se resuelva, **no hay un respaldo reciente**. Hacerlo el mismo día.

## 8. Límites y puntos a validar

- Los timers de systemd (`ops/backup/systemd/`) se **escribieron y verificaron sintácticamente, pero no se pudieron ejecutar en Linux** durante el desarrollo (se probaron en Windows con Git Bash). La primera instalación real tiene que correr los pasos 3.6 y el simulacro de la sección 6, y revisar `systemd-analyze verify`.
- El servidor **no puede comprobar que un respaldo se descifre**, porque no tiene la clave privada (esa es justamente la protección). Solo el simulacro lo prueba: **no saltearlo**.
- **Datos de salud fuera del país:** si el destino remoto está en el exterior, consultar al abogado (transferencia internacional de datos personales, Ley 25.326). El cifrado con claves que quedan en Argentina lo mitiga, pero es una decisión legal, no técnica.
- La ventana de pérdida (RPO) es de hasta 24 horas con un respaldo diario. Para reducirla, agregar un segundo `OnCalendar=` en el timer.
- No se respalda el código (está en el repositorio) ni los logs.
- La clave de root de MySQL no se guarda en ningún lado: se pasa como variable del momento.

## 9. Checklist por instalación (completar una por cliente)

| Punto | Hecho / Dato |
|---|---|
| Cliente / servidor / fecha de instalación | |
| Usuario `turnero-backup` y carpetas con permisos 700/750 | ☐ |
| age instalado (versión y SHA-256 verificado) | ☐ |
| Clave privada generada por el titular, fuera del servidor | ☐ |
| Copia de la clave privada en un 2.º lugar independiente | ☐ Lugar: |
| 2.º destinatario (opcional): quién | |
| `recipients.txt` con solo claves públicas | ☐ |
| `setup-backup-user.sh` corrido; `turnero_backup` solo lectura | ☐ |
| `backup.conf` completo (`ALERT_TO`, `REMOTE`, retención) | ☐ |
| Destino remoto: proveedor / región / credencial sin permiso de borrar | |
| Consulta al abogado sobre datos fuera del país (si aplica) | ☐ Resultado: |
| Primera corrida a mano OK (archivos `.age` con permisos 600) | ☐ |
| Timers activos (`systemctl list-timers 'turnero-*'`) | ☐ |
| Alerta de prueba recibida en `ALERT_TO` | ☐ |
| **Simulacro de restauración desde la copia remota: `TODO BIEN`** | ☐ Fecha / quién: |
| Próximo simulacro (cada 3 meses) | |
