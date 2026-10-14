#!/usr/bin/env bash
# Restaura un respaldo de Turnero en una base NUEVA y la verifica. Ver RESPALDOS.md.
#
#   RESTORE_DB_USER=... RESTORE_DB_PASSWORD=... \
#   restore.sh --file turnero-AAAAMMDD-HHMMSS.sql.gz.age \
#              --identity /ruta/clave-privada.txt \
#              --target-db turnero_restore_prueba \
#              [--manifest turnero-AAAAMMDD-HHMMSS.manifest.json] \
#              [--host 127.0.0.1] [--port 3306] [--app-dir /opt/turnero/Backend] [--no-verify]
#
# La cuenta de RESTORE_DB_USER necesita crear bases y triggers (por ejemplo root);
# se pasa por variables del momento, nunca se guarda.
#
# Seguridad: por defecto SOLO restaura en bases cuyo nombre empieza con
# "turnero_restore" (descartables: si existen, se vuelven a crear). Para
# restaurar en la base real hay que pasar --confirm-overwrite <nombre exacto>.
set -Eeuo pipefail
umask 077

FILE="" IDENTITY="" TARGET="" MANIFEST="" CONFIRM="" NO_VERIFY=0
HOST="127.0.0.1" PORT="3306"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
AGE_BIN="${AGE_BIN:-age}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
NODE_BIN="${NODE_BIN:-node}"

usage() { sed -n '2,17p' "$0"; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --identity) IDENTITY="$2"; shift 2 ;;
    --target-db) TARGET="$2"; shift 2 ;;
    --manifest) MANIFEST="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --confirm-overwrite) CONFIRM="$2"; shift 2 ;;
    --no-verify) NO_VERIFY=1; shift ;;
    -h|--help) usage ;;
    *) echo "Opción desconocida: $1" >&2; usage ;;
  esac
done

[ -n "$FILE" ] && [ -n "$IDENTITY" ] && [ -n "$TARGET" ] || usage
[ -f "$FILE" ] || { echo "No existe el respaldo: $FILE" >&2; exit 2; }
[ -f "$IDENTITY" ] || { echo "No existe la clave privada: $IDENTITY" >&2; exit 2; }
: "${RESTORE_DB_USER:?Falta RESTORE_DB_USER (cuenta que puede crear bases y triggers)}"
: "${RESTORE_DB_PASSWORD:?Falta RESTORE_DB_PASSWORD}"
[[ "$TARGET" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nombre de base inválido: $TARGET" >&2; exit 2; }

if [[ "$TARGET" != turnero_restore* ]]; then
  if [ "$CONFIRM" != "$TARGET" ]; then
    echo "REFUSADO: '$TARGET' no es una base descartable (turnero_restore*)." >&2
    echo "Restaurar sobre ella BORRA lo que tenga. Si es lo que querés, repetir con: --confirm-overwrite $TARGET" >&2
    exit 4
  fi
  echo "ATENCIÓN: se va a BORRAR y recrear la base '$TARGET'. Ctrl+C en 10 segundos para cancelar."
  sleep 10
fi

# la clave de la cuenta va en un archivo temporal, no en la línea de comandos
CNF="$(mktemp)"
trap 'rm -f -- "$CNF"' EXIT
printf '[client]\nuser=%s\npassword=%s\n' "$RESTORE_DB_USER" "$RESTORE_DB_PASSWORD" > "$CNF"
mysql_cli() { "$MYSQL_BIN" --defaults-file="$CNF" --host="$HOST" --port="$PORT" "$@"; }

# 1. la huella del archivo tiene que coincidir con la del manifiesto
if [ -n "$MANIFEST" ]; then
  EXPECTED="$(grep -o '"sha256": *"[0-9a-f]*"' "$MANIFEST" | grep -o '[0-9a-f]\{64\}')"
  ACTUAL="$(sha256sum "$FILE" | cut -d' ' -f1)"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "FALLA: la huella del archivo no coincide con el manifiesto (el respaldo cambió o se dañó)." >&2
    echo "  manifiesto: $EXPECTED" >&2
    echo "  archivo:    $ACTUAL" >&2
    exit 5
  fi
  echo "Huella SHA-256 del archivo: coincide con el manifiesto."
else
  echo "AVISO: sin --manifest no se puede comprobar la huella del archivo ni comparar cantidades."
fi

# 2. se prueba que se pueda descifrar y que el volcado esté completo (mysqldump
#    termina con "Dump completed"; si falta, el archivo está cortado)
LAST_LINE="$("$AGE_BIN" -d -i "$IDENTITY" "$FILE" | gunzip | tail -n 1)" || {
  echo "FALLA: no se pudo descifrar o descomprimir el respaldo (¿clave equivocada o archivo dañado?)." >&2
  exit 6
}
case "$LAST_LINE" in
  *"Dump completed"*) echo "Respaldo descifrado: el volcado está completo." ;;
  *) echo "FALLA: el volcado está incompleto (no termina con 'Dump completed')." >&2; exit 6 ;;
esac

# 3. base nueva (si es descartable y existe, se vuelve a crear)
echo "Creando la base $TARGET..."
mysql_cli -e "DROP DATABASE IF EXISTS \`$TARGET\`; CREATE DATABASE \`$TARGET\` CHARACTER SET utf8mb4;"
echo "Restaurando..."
"$AGE_BIN" -d -i "$IDENTITY" "$FILE" | gunzip | mysql_cli --default-character-set=utf8mb4 "$TARGET"
echo "Restauración cargada en $TARGET."

# 4. verificación
if [ "$NO_VERIFY" -eq 1 ]; then
  echo "AVISO: se omitió la verificación (--no-verify). La restauración NO está comprobada."
  exit 0
fi
cd "$APP_DIR"
VERIFY_DB_HOST="$HOST" VERIFY_DB_PORT="$PORT" \
VERIFY_DB_USER="$RESTORE_DB_USER" VERIFY_DB_PASSWORD="$RESTORE_DB_PASSWORD" \
VERIFY_DB_NAME="$TARGET" VERIFY_MANIFEST="$MANIFEST" \
  "$NODE_BIN" dist/backup/verify-restore.js
