#!/usr/bin/env bash
# Crea (o rota la clave de) el usuario de MySQL de los respaldos y escribe su
# archivo de credenciales. Ver RESPALDOS.md.
#
#   ADMIN_DB_USER=... ADMIN_DB_PASSWORD=... \
#   setup-backup-user.sh --db turnero --cnf /etc/turnero-backup/mysql.cnf \
#                        [--user turnero_backup] [--host 127.0.0.1] [--port 3306]
#
# El usuario solo puede LEER la base (SELECT, SHOW VIEW y TRIGGER, que
# mysqldump necesita para volcar los triggers de inmutabilidad): no puede
# escribir, ni borrar, ni cambiar el esquema, y solo se conecta desde el
# propio servidor. No es root ni el usuario de la app. La cuenta de
# administración se pasa por variables del momento y no se guarda.
set -Eeuo pipefail
umask 077

DB="" CNF="" USER_NAME="turnero_backup" HOST="127.0.0.1" PORT="3306"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB="$2"; shift 2 ;;
    --cnf) CNF="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done
[ -n "$DB" ] && [ -n "$CNF" ] || { sed -n '2,13p' "$0"; exit 2; }
: "${ADMIN_DB_USER:?Falta ADMIN_DB_USER}"
: "${ADMIN_DB_PASSWORD:?Falta ADMIN_DB_PASSWORD}"
[[ "$DB" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nombre de base inválido" >&2; exit 2; }
[[ "$USER_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nombre de usuario inválido" >&2; exit 2; }

ADMIN_CNF="$(mktemp)"
trap 'rm -f -- "$ADMIN_CNF"' EXIT
printf '[client]\nuser=%s\npassword=%s\n' "$ADMIN_DB_USER" "$ADMIN_DB_PASSWORD" > "$ADMIN_CNF"

# clave larga y aleatoria, sin caracteres que compliquen el archivo de credenciales
PASSWORD="$(openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40)"

"$MYSQL_BIN" --defaults-file="$ADMIN_CNF" --host="$HOST" --port="$PORT" <<SQL
CREATE USER IF NOT EXISTS '$USER_NAME'@'localhost' IDENTIFIED BY '$PASSWORD';
ALTER USER '$USER_NAME'@'localhost' IDENTIFIED BY '$PASSWORD';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$USER_NAME'@'localhost';
GRANT SELECT, SHOW VIEW, TRIGGER ON \`$DB\`.* TO '$USER_NAME'@'localhost';
SQL

mkdir -p "$(dirname "$CNF")"
printf '[client]\nuser=%s\npassword=%s\n' "$USER_NAME" "$PASSWORD" > "$CNF"
chmod 600 "$CNF"
echo "Usuario '$USER_NAME'@'localhost' listo (solo lectura sobre $DB). Credenciales en $CNF (permisos 600)."
