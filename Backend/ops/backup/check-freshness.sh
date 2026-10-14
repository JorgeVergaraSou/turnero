#!/usr/bin/env bash
# Red de seguridad: avisa si el último respaldo exitoso es demasiado viejo o no
# existe (por ejemplo, si el timer dejó de correr). La corre un timer propio,
# aparte del respaldo, así un respaldo que "no se ejecutó" también se nota.
# Termina con error (y avisa por email si hay ALERT_TO) cuando está atrasado.
set -Eeuo pipefail

CONFIG="${BACKUP_CONFIG:-/etc/turnero-backup/backup.conf}"
[ -r "$CONFIG" ] || { echo "No se puede leer la configuración: $CONFIG" >&2; exit 2; }
# shellcheck disable=SC1090
source "$CONFIG"
: "${BACKUP_DIR:?Falta BACKUP_DIR}"
: "${APP_DIR:?Falta APP_DIR}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
ALERT_TO="${ALERT_TO:-}"
NODE_BIN="${NODE_BIN:-node}"

alert() {
  echo "$1" >&2
  if [ -n "$ALERT_TO" ]; then
    (cd "$APP_DIR" && ALERT_TO="$ALERT_TO" "$NODE_BIN" dist/backup/notify.js "$1") || true
  fi
  exit 1
}

STATUS="$BACKUP_DIR/last-success.json"
[ -f "$STATUS" ] || alert "No hay registro de ningún respaldo exitoso en $BACKUP_DIR."
EPOCH="$(grep -o '"epoch": *[0-9]*' "$STATUS" | grep -o '[0-9]*$' || true)"
[ -n "$EPOCH" ] || alert "El registro del último respaldo ($STATUS) está dañado."
AGE_HOURS=$(( ($(date +%s) - EPOCH) / 3600 ))
if [ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]; then
  alert "El último respaldo exitoso tiene ${AGE_HOURS} horas (el máximo tolerado es ${MAX_AGE_HOURS})."
fi
echo "Último respaldo exitoso hace ${AGE_HOURS} horas: bien."
