#!/usr/bin/env bash
# Respaldo cifrado de Turnero. Ver RESPALDOS.md.
#
# Hace, en este orden:
#   1. vuelca la base con un usuario de MySQL de solo lectura (turnero_backup),
#      la comprime y la cifra con age EN TUBERÍA: el SQL en claro nunca toca el disco;
#   2. cifra también el .env (de él depende descifrar los secretos de 2FA) y la
#      carpeta de archivos subidos;
#   3. escribe un manifiesto con la huella SHA-256 de lo cifrado y los conteos;
#   4. si hay REMOTE, copia el conjunto fuera del servidor y lo verifica;
#   5. rota los respaldos viejos (solo si todo lo anterior salió bien).
# Si algo falla: no deja archivos a medio escribir, registra last-failure.json,
# avisa por email (ALERT_TO) y termina con error.
set -Eeuo pipefail
umask 077

CONFIG="${BACKUP_CONFIG:-/etc/turnero-backup/backup.conf}"
[ -r "$CONFIG" ] || { echo "No se puede leer la configuración: $CONFIG" >&2; exit 2; }
# shellcheck disable=SC1090
source "$CONFIG"

: "${DB_NAME:?Falta DB_NAME en $CONFIG}"
: "${MYSQL_DEFAULTS_FILE:?Falta MYSQL_DEFAULTS_FILE en $CONFIG}"
: "${AGE_RECIPIENTS_FILE:?Falta AGE_RECIPIENTS_FILE en $CONFIG}"
: "${BACKUP_DIR:?Falta BACKUP_DIR en $CONFIG}"
: "${APP_DIR:?Falta APP_DIR en $CONFIG}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
AGE_BIN="${AGE_BIN:-age}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"
NODE_BIN="${NODE_BIN:-node}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/uploads}"
REMOTE="${REMOTE:-}"
[ -z "${RCLONE_CONFIG:-}" ] || export RCLONE_CONFIG
ALERT_TO="${ALERT_TO:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
# Tablas que solo crecen: sus conteos antes y después del volcado permiten
# comprobar, al restaurar, que no falta ni sobra nada.
MONOTONIC_TABLES="${MONOTONIC_TABLES:-audit_logs medical_consultations consultation_diagnoses consultation_medications consultation_study_requests consultation_amendments privacy_notices privacy_consents appointment_calls appointment_status_history history_export_requests}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="turnero-$STAMP.sql.gz.age"
ENV_OUT="env-$STAMP.age"
UPLOADS_OUT="uploads-$STAMP.tar.gz.age"
MANIFEST="turnero-$STAMP.manifest.json"
FILES_WRITTEN=()

log() { echo "[$(date '+%F %T')] $*"; }

mysql_cli() {
  "$MYSQL_BIN" --defaults-file="$MYSQL_DEFAULTS_FILE" --host="$DB_HOST" --port="$DB_PORT" "$@"
}

ping_health() {
  [ -n "$HEALTHCHECK_URL" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || log "(no se pudo avisar al servicio de monitoreo)"
}

on_error() {
  local code=$? line=$1
  trap - ERR
  log "FALLÓ el respaldo (línea $line, código $code)."
  # nada a medio escribir: se borran los archivos de esta corrida
  for f in "${FILES_WRITTEN[@]:-}"; do
    [ -n "$f" ] && rm -f -- "$BACKUP_DIR/$f" "$BACKUP_DIR/$f.partial"
  done
  rm -rf -- "$LOCK_DIR"
  printf '{"stamp":"%s","epoch":%s,"error":"fallo en la linea %s (codigo %s)"}\n' \
    "$STAMP" "$(date +%s)" "$line" "$code" > "$BACKUP_DIR/last-failure.json"
  ping_health /fail
  if [ -n "$ALERT_TO" ]; then
    (cd "$APP_DIR" && ALERT_TO="$ALERT_TO" "$NODE_BIN" dist/backup/notify.js \
      "El respaldo del $STAMP falló (línea $line, código $code). No hay un respaldo nuevo.") || true
  fi
  exit "$code"
}

# un solo respaldo a la vez (mkdir es atómico y funciona en cualquier sistema)
LOCK_DIR="$BACKUP_DIR/.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Ya hay un respaldo en curso ($LOCK_DIR). Si quedó de una corrida que murió, borrar esa carpeta." >&2
  exit 3
fi
trap 'on_error $LINENO' ERR
trap 'rm -rf -- "$LOCK_DIR"' EXIT

# restos de corridas anteriores que murieron a la mitad
find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -delete

count_tables() {
  local first=1 out="{" t n
  for t in $MONOTONIC_TABLES; do
    n="$(mysql_cli -N -e "SELECT COUNT(*) FROM \`$t\`" "$DB_NAME")"
    [ $first -eq 1 ] || out+=","
    out+="\"$t\":$n"
    first=0
  done
  echo "$out}"
}

log "Respaldo $STAMP de la base $DB_NAME"
MYSQL_VERSION="$(mysql_cli -N -e 'SELECT VERSION()' "$DB_NAME")"
LATEST_MIGRATION="$(mysql_cli -N -e 'SELECT COALESCE(MAX(`timestamp`),0) FROM migrations' "$DB_NAME")"
COUNTS_BEFORE="$(count_tables)"

FILES_WRITTEN+=("$DB_FILE")
# --single-transaction: foto consistente sin bloquear a la app. La base no usa
# rutinas ni eventos (solo tablas y triggers), así que el usuario de respaldo no
# necesita más permisos que SELECT, SHOW VIEW y TRIGGER.
"$MYSQLDUMP_BIN" --defaults-file="$MYSQL_DEFAULTS_FILE" --host="$DB_HOST" --port="$DB_PORT" \
  --single-transaction --triggers --hex-blob --no-tablespaces --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 "$DB_NAME" \
  | gzip -9 \
  | "$AGE_BIN" -R "$AGE_RECIPIENTS_FILE" -o "$BACKUP_DIR/$DB_FILE.partial"
mv -- "$BACKUP_DIR/$DB_FILE.partial" "$BACKUP_DIR/$DB_FILE"

COUNTS_AFTER="$(count_tables)"

# comprobaciones que el servidor SÍ puede hacer (no tiene la clave privada):
# que sea un archivo age y que no esté vacío
BYTES="$(wc -c < "$BACKUP_DIR/$DB_FILE" | tr -d ' ')"
head -c 21 "$BACKUP_DIR/$DB_FILE" | grep -q '^age-encryption.org/v1' \
  || { log "El archivo generado no es un archivo age."; false; }
[ "$BYTES" -gt 1000 ] || { log "El respaldo es sospechosamente chico ($BYTES bytes)."; false; }
SHA256="$(sha256sum "$BACKUP_DIR/$DB_FILE" | cut -d' ' -f1)"

# el .env: SECRET_WORD/TWO_FACTOR_KEY cifran los secretos de 2FA y los tokens de las pantallas
HAS_ENV=0
if [ -r "$ENV_FILE" ]; then
  FILES_WRITTEN+=("$ENV_OUT")
  "$AGE_BIN" -R "$AGE_RECIPIENTS_FILE" -o "$BACKUP_DIR/$ENV_OUT.partial" "$ENV_FILE"
  mv -- "$BACKUP_DIR/$ENV_OUT.partial" "$BACKUP_DIR/$ENV_OUT"
  HAS_ENV=1
else
  log "AVISO: no se pudo leer $ENV_FILE; este respaldo no incluye el .env."
fi

HAS_UPLOADS=0
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  FILES_WRITTEN+=("$UPLOADS_OUT")
  tar -C "$UPLOADS_DIR" -czf - . | "$AGE_BIN" -R "$AGE_RECIPIENTS_FILE" -o "$BACKUP_DIR/$UPLOADS_OUT.partial"
  mv -- "$BACKUP_DIR/$UPLOADS_OUT.partial" "$BACKUP_DIR/$UPLOADS_OUT"
  HAS_UPLOADS=1
fi

FILES_WRITTEN+=("$MANIFEST")
cat > "$BACKUP_DIR/$MANIFEST" <<EOF
{
  "stamp": "$STAMP",
  "createdAt": "$(date -u +%FT%TZ)",
  "db": "$DB_NAME",
  "mysqlVersion": "$MYSQL_VERSION",
  "latestMigration": $LATEST_MIGRATION,
  "file": "$DB_FILE",
  "sha256": "$SHA256",
  "bytes": $BYTES,
  "envFile": $([ $HAS_ENV -eq 1 ] && echo "\"$ENV_OUT\"" || echo null),
  "uploadsFile": $([ $HAS_UPLOADS -eq 1 ] && echo "\"$UPLOADS_OUT\"" || echo null),
  "countsBefore": $COUNTS_BEFORE,
  "countsAfter": $COUNTS_AFTER
}
EOF

# copia fuera del servidor (cifrada antes de salir: el proveedor no ve nada)
if [ -n "$REMOTE" ]; then
  log "Copiando fuera del servidor a $REMOTE"
  for f in "$DB_FILE" "$MANIFEST" "$ENV_OUT" "$UPLOADS_OUT"; do
    [ -f "$BACKUP_DIR/$f" ] || continue
    "$RCLONE_BIN" copyto "$BACKUP_DIR/$f" "${REMOTE%/}/$f" --immutable
  done
  # verifica que lo subido sea idéntico (tamaño y huella) antes de dar por bueno el respaldo
  "$RCLONE_BIN" check "$BACKUP_DIR" "$REMOTE" --one-way --include "*-$STAMP.*"
fi

printf '{"stamp":"%s","epoch":%s,"file":"%s","sha256":"%s","bytes":%s}\n' \
  "$STAMP" "$(date +%s)" "$DB_FILE" "$SHA256" "$BYTES" > "$BACKUP_DIR/last-success.json"
rm -f -- "$BACKUP_DIR/last-failure.json"
trap - ERR

# rotación: después de dejar registrado el éxito (rotate.js se niega si el más nuevo no es el último exitoso)
if ! (cd "$APP_DIR" && "$NODE_BIN" dist/backup/rotate.js "$BACKUP_DIR"); then
  log "AVISO: la rotación falló (el respaldo de hoy está bien)."
fi

ping_health ""
log "Respaldo listo: $DB_FILE ($BYTES bytes, sha256 $SHA256)"
