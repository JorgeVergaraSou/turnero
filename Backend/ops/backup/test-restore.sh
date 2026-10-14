#!/usr/bin/env bash
# Prueba REAL del circuito completo de respaldos, de punta a punta:
# respaldo cifrado -> restauración en una base descartable -> verificación, más
# los casos en que TIENE que fallar (clave equivocada, archivo dañado o cortado,
# base alterada, permisos del usuario de respaldo). No toca la base de
# producción: solo lee la base indicada y escribe en bases turnero_restore_*.
#
#   ADMIN_DB_USER=... ADMIN_DB_PASSWORD=... \
#   AGE_BIN=/ruta/age AGE_KEYGEN_BIN=/ruta/age-keygen \
#   ops/backup/test-restore.sh [--db turnero_e2e]
#
# Hay que haber compilado la app (npm run build) y tener mysql, mysqldump y age.
# Conviene correrlo después de cada cambio de esquema y antes de entregar una
# instalación nueva. Termina con código 0 solo si TODO pasó.
set -uo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../.." && pwd)"
SOURCE_DB="turnero_e2e"
HOST="127.0.0.1"; PORT="3306"
while [ $# -gt 0 ]; do
  case "$1" in
    --db) SOURCE_DB="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done
: "${ADMIN_DB_USER:?Falta ADMIN_DB_USER}"
: "${ADMIN_DB_PASSWORD:?Falta ADMIN_DB_PASSWORD}"
AGE_BIN="${AGE_BIN:-age}"
AGE_KEYGEN_BIN="${AGE_KEYGEN_BIN:-age-keygen}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
[ -f "$APP_DIR/dist/backup/verify-restore.js" ] || { echo "Falta compilar la app (npm run build)." >&2; exit 2; }

WORK="$(mktemp -d)"
RESTORE_DB="turnero_restore_drill"
BACKUP_USER="turnero_backup_drill"
ADMIN_CNF="$WORK/admin.cnf"
printf '[client]\nuser=%s\npassword=%s\n' "$ADMIN_DB_USER" "$ADMIN_DB_PASSWORD" > "$ADMIN_CNF"
admin_mysql() { "$MYSQL_BIN" --defaults-file="$ADMIN_CNF" --host="$HOST" --port="$PORT" "$@"; }

cleanup() {
  admin_mysql -e "DROP DATABASE IF EXISTS \`$RESTORE_DB\`; DROP USER IF EXISTS '$BACKUP_USER'@'localhost';" 2>/dev/null
  rm -rf -- "$WORK"
}
trap cleanup EXIT

PASS=0; FAIL=0
ok()   { echo "  [OK]    $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FALLA] $1"; FAIL=$((FAIL+1)); }
# expect <código esperado> <descripción> -- comando...
expect() {
  local want="$1" what="$2"; shift 3
  local out; out="$("$@" 2>&1)"; local got=$?
  if [ "$got" -eq "$want" ]; then ok "$what (salió con $got)"; else bad "$what: esperaba código $want y salió con $got"; echo "$out" | tail -n 8 | sed 's/^/          /'; fi
}

export RESTORE_DB_USER="$ADMIN_DB_USER" RESTORE_DB_PASSWORD="$ADMIN_DB_PASSWORD"
export AGE_BIN HOST PORT
restore() { "$HERE/restore.sh" --host "$HOST" --port "$PORT" --app-dir "$APP_DIR" "$@"; }

echo "== 1. Claves de la prueba (pares descartables, solo para este test)"
"$AGE_KEYGEN_BIN" -o "$WORK/clave.txt" 2>/dev/null
"$AGE_KEYGEN_BIN" -y "$WORK/clave.txt" > "$WORK/destinatarios.txt"
"$AGE_KEYGEN_BIN" -o "$WORK/otra-clave.txt" 2>/dev/null
[ -s "$WORK/destinatarios.txt" ] && ok "par de claves age generado" || { bad "no se pudo generar la clave"; exit 1; }

echo "== 2. Usuario de respaldo de solo lectura"
ADMIN_DB_USER="$ADMIN_DB_USER" ADMIN_DB_PASSWORD="$ADMIN_DB_PASSWORD" \
  "$HERE/setup-backup-user.sh" --db "$SOURCE_DB" --cnf "$WORK/mysql.cnf" --user "$BACKUP_USER" --host "$HOST" --port "$PORT" >/dev/null \
  && ok "usuario $BACKUP_USER creado" || { bad "no se pudo crear el usuario de respaldo"; exit 1; }
BK="$MYSQL_BIN --defaults-file=$WORK/mysql.cnf --host=$HOST --port=$PORT"
$BK -N -e "SELECT COUNT(*) FROM audit_logs" "$SOURCE_DB" >/dev/null 2>&1 && ok "puede LEER la base" || bad "no puede leer la base"
for sql in "CREATE TABLE intruso (id INT)" "DELETE FROM privacy_notices" "UPDATE patients SET phone='0'" "INSERT INTO specialties (name) VALUES ('x')" "DROP TABLE patients"; do
  if $BK -e "$sql" "$SOURCE_DB" >/dev/null 2>&1; then bad "el usuario de respaldo PUDO ejecutar: $sql"; else ok "no puede: $sql"; fi
done

echo "== 3. Respaldo real de la base $SOURCE_DB"
BACKUP_DIR="$WORK/respaldos"
cat > "$WORK/backup.conf" <<EOF
DB_NAME=$SOURCE_DB
DB_HOST=$HOST
DB_PORT=$PORT
MYSQL_DEFAULTS_FILE=$WORK/mysql.cnf
AGE_RECIPIENTS_FILE=$WORK/destinatarios.txt
BACKUP_DIR=$BACKUP_DIR
APP_DIR=$APP_DIR
ENV_FILE=$APP_DIR/.env
AGE_BIN=$AGE_BIN
EOF
BACKUP_CONFIG="$WORK/backup.conf" "$HERE/backup.sh" > "$WORK/backup.log" 2>&1 \
  && ok "backup.sh terminó bien" || { bad "backup.sh falló"; tail -n 15 "$WORK/backup.log" | sed 's/^/          /'; exit 1; }
DUMP="$(ls "$BACKUP_DIR"/turnero-*.sql.gz.age 2>/dev/null | head -n 1)"
MANIFEST="$(ls "$BACKUP_DIR"/turnero-*.manifest.json 2>/dev/null | head -n 1)"
ENVFILE="$(ls "$BACKUP_DIR"/env-*.age 2>/dev/null | head -n 1)"
[ -f "$DUMP" ] && [ -f "$MANIFEST" ] && ok "se generaron el volcado cifrado y el manifiesto" || { bad "faltan archivos del respaldo"; exit 1; }
[ -f "$ENVFILE" ] && ok "el .env se respaldó cifrado" || bad "no se respaldó el .env"
[ -f "$BACKUP_DIR/last-success.json" ] && ok "quedó registrado el último éxito" || bad "falta last-success.json"
[ "$(stat -c %a "$DUMP" 2>/dev/null || echo 600)" = "600" ] && ok "el archivo cifrado tiene permisos 600" || bad "permisos del archivo cifrado distintos de 600"

echo "== 4. Nada en claro en disco"
LEAKS="$(grep -rlaE "CREATE TABLE|INSERT INTO|SECRET_WORD|medical_consultations" "$BACKUP_DIR" 2>/dev/null | grep -v manifest.json || true)"
[ -z "$LEAKS" ] && ok "ni el volcado ni el .env tienen texto legible" || bad "hay texto legible en: $LEAKS"
ls "$BACKUP_DIR" | grep -qE '\.(sql|sql\.gz)$' && bad "hay un volcado sin cifrar" || ok "no hay volcados sin cifrar"
head -c 21 "$ENVFILE" | grep -q 'age-encryption.org' && ok "el .env respaldado es un archivo age" || bad "el .env no está cifrado"

echo "== 5. Restauración real y verificación"
OUT="$(restore --file "$DUMP" --manifest "$MANIFEST" --identity "$WORK/clave.txt" --target-db "$RESTORE_DB" 2>&1)"; CODE=$?
echo "$OUT" | sed 's/^/          /' | tail -n 14
[ $CODE -eq 0 ] && ok "restore.sh restauró y la verificación dio TODO BIEN" || bad "la restauración o la verificación fallaron (código $CODE)"
echo "$OUT" | grep -q "Huellas de las consultas finalizadas: [1-9][0-9]* consultas" && ok "se comprobaron las huellas de consultas reales (no 0)" || bad "no se comprobó ninguna consulta finalizada"
RESTORED_TRIGGERS="$(admin_mysql -N -e "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$RESTORE_DB'")"
SOURCE_TRIGGERS="$(admin_mysql -N -e "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$SOURCE_DB'")"
[ "$RESTORED_TRIGGERS" = "$SOURCE_TRIGGERS" ] && ok "triggers restaurados: $RESTORED_TRIGGERS de $SOURCE_TRIGGERS" || bad "triggers: $RESTORED_TRIGGERS restaurados de $SOURCE_TRIGGERS"
for t in patients medical_consultations audit_logs users; do
  a="$(admin_mysql -N -e "SELECT COUNT(*) FROM \`$SOURCE_DB\`.\`$t\`")"; b="$(admin_mysql -N -e "SELECT COUNT(*) FROM \`$RESTORE_DB\`.\`$t\`")"
  [ "$a" = "$b" ] && ok "$t: $b filas, igual que el original" || echo "          (aviso) $t: original $a, restaurada $b (puede haber cambiado entre el respaldo y ahora)"
done

echo "== 6. Casos que TIENEN que fallar"
expect 6 "clave privada equivocada" -- restore --file "$DUMP" --manifest "$MANIFEST" --identity "$WORK/otra-clave.txt" --target-db "${RESTORE_DB}_x"
cp "$DUMP" "$WORK/dañado.sql.gz.age"; printf 'X' | dd of="$WORK/dañado.sql.gz.age" bs=1 seek=5000 conv=notrunc 2>/dev/null
expect 5 "archivo dañado (la huella del manifiesto no coincide)" -- restore --file "$WORK/dañado.sql.gz.age" --manifest "$MANIFEST" --identity "$WORK/clave.txt" --target-db "${RESTORE_DB}_x"
expect 6 "archivo dañado y sin manifiesto (el cifrado autenticado lo detecta)" -- restore --file "$WORK/dañado.sql.gz.age" --identity "$WORK/clave.txt" --target-db "${RESTORE_DB}_x"
head -c "$(( $(wc -c < "$DUMP") / 2 ))" "$DUMP" > "$WORK/cortado.sql.gz.age"
expect 5 "archivo cortado a la mitad con manifiesto" -- restore --file "$WORK/cortado.sql.gz.age" --manifest "$MANIFEST" --identity "$WORK/clave.txt" --target-db "${RESTORE_DB}_x"
expect 6 "archivo cortado a la mitad sin manifiesto" -- restore --file "$WORK/cortado.sql.gz.age" --identity "$WORK/clave.txt" --target-db "${RESTORE_DB}_x"
expect 4 "restaurar sobre una base que no es descartable sin confirmar" -- restore --file "$DUMP" --manifest "$MANIFEST" --identity "$WORK/clave.txt" --target-db "$SOURCE_DB"
admin_mysql -N -e "SHOW DATABASES" | grep -q "^${RESTORE_DB}_x$" && bad "una restauración fallida dejó una base a medias" || ok "las restauraciones fallidas no tocaron ninguna base"

echo "== 7. Una base restaurada pero alterada tiene que ser detectada"
admin_mysql -e "DROP TRIGGER \`$RESTORE_DB\`.trg_audit_logs_no_delete; DROP TRIGGER \`$RESTORE_DB\`.trg_consultations_no_update_finalized;"
admin_mysql -e "UPDATE \`$RESTORE_DB\`.medical_consultations SET reason='alterado a mano' WHERE status='FINALIZADA' ORDER BY id LIMIT 1;"
admin_mysql -e "DROP TRIGGER \`$RESTORE_DB\`.trg_privacy_consents_no_delete; DELETE FROM \`$RESTORE_DB\`.privacy_consents ORDER BY id DESC LIMIT 1;"
VOUT="$(cd "$APP_DIR" && VERIFY_DB_HOST="$HOST" VERIFY_DB_PORT="$PORT" VERIFY_DB_USER="$ADMIN_DB_USER" VERIFY_DB_PASSWORD="$ADMIN_DB_PASSWORD" VERIFY_DB_NAME="$RESTORE_DB" VERIFY_MANIFEST="$MANIFEST" node dist/backup/verify-restore.js 2>&1)"; VCODE=$?
echo "$VOUT" | sed 's/^/          /' | tail -n 12
[ $VCODE -eq 1 ] && ok "la verificación falló (código 1)" || bad "la verificación debía fallar y salió con $VCODE"
echo "$VOUT" | grep -q "FALLA\] Triggers de inmutabilidad: Faltan 3" && ok "detectó los 3 triggers que faltan" || bad "no detectó los triggers que faltan"
echo "$VOUT" | grep -q "FALLA\] Huellas de las consultas finalizadas: no coincide" && ok "detectó la consulta clínica alterada" || bad "no detectó la consulta alterada"
echo "$VOUT" | grep -q "FALLA\] Cantidad de registros: privacy_consents" && ok "detectó la constancia de consentimiento que falta" || bad "no detectó el registro borrado"

echo "== 8. Rotación"
ROT="$WORK/rotacion"; mkdir -p "$ROT"
for d in 01 02 03 04 05; do for f in "turnero-202601$d-030000.sql.gz.age" "env-202601$d-030000.age" "turnero-202601$d-030000.manifest.json"; do : > "$ROT/$f"; done; done
echo '{"stamp":"20260105-030000"}' > "$ROT/last-success.json"
(cd "$APP_DIR" && KEEP_DAILY=2 KEEP_WEEKLY=0 KEEP_MONTHLY=0 node dist/backup/rotate.js "$ROT") >/dev/null
REMAINING="$(ls "$ROT" | grep -c 'sql.gz.age')"
# se queda el del 05 (más nuevo), el del 04 (2 diarios) y el 05/01 como último del mes y del año
[ "$REMAINING" -le 3 ] && [ -f "$ROT/turnero-20260105-030000.sql.gz.age" ] && [ -f "$ROT/last-success.json" ] && ok "la rotación borró lo viejo y conservó lo nuevo ($REMAINING conjuntos)" || bad "la rotación dejó $REMAINING conjuntos"
echo '{"stamp":"20260101-030000"}' > "$ROT/last-success.json"
BEFORE="$(ls "$ROT" | wc -l)"
(cd "$APP_DIR" && KEEP_DAILY=0 KEEP_WEEKLY=0 KEEP_MONTHLY=0 node dist/backup/rotate.js "$ROT") >/dev/null
[ "$(ls "$ROT" | wc -l)" -eq "$BEFORE" ] && ok "no borra nada si el último respaldo no fue exitoso" || bad "borró archivos aunque el último respaldo no fue exitoso"

echo "== 9. Si el respaldo falla, no queda nada a medias y se registra"
FAILDIR="$WORK/respaldos-falla"
sed -e "s#^BACKUP_DIR=.*#BACKUP_DIR=$FAILDIR#" -e "s#^MYSQL_DEFAULTS_FILE=.*#MYSQL_DEFAULTS_FILE=$WORK/clave-mala.cnf#" "$WORK/backup.conf" > "$WORK/backup-falla.conf"
printf '[client]\nuser=%s\npassword=clave-incorrecta\n' "$BACKUP_USER" > "$WORK/clave-mala.cnf"
BACKUP_CONFIG="$WORK/backup-falla.conf" "$HERE/backup.sh" > "$WORK/falla.log" 2>&1; FCODE=$?
[ $FCODE -ne 0 ] && ok "backup.sh termina con error si no puede conectarse (código $FCODE)" || bad "backup.sh dijo que andaba bien con una clave incorrecta"
[ -f "$FAILDIR/last-failure.json" ] && ok "queda registrado el fallo (last-failure.json)" || bad "no quedó registrado el fallo"
[ ! -f "$FAILDIR/last-success.json" ] && ok "no se registra un éxito que no ocurrió" || bad "se registró un éxito falso"
[ -z "$(ls "$FAILDIR" | grep -E '^(turnero|env|uploads)-')" ] && ok "no quedaron archivos de respaldo a medias" || bad "quedaron archivos: $(ls "$FAILDIR")"
[ ! -d "$FAILDIR/.lock" ] && ok "se liberó el candado" || bad "quedó el candado puesto"
# un respaldo que falla a la mitad (el cifrado no puede escribir): tampoco deja restos
sed -e "s#^BACKUP_DIR=.*#BACKUP_DIR=$WORK/respaldos-falla2#" -e "s#^AGE_RECIPIENTS_FILE=.*#AGE_RECIPIENTS_FILE=$WORK/no-existe.txt#" "$WORK/backup.conf" > "$WORK/backup-falla2.conf"
BACKUP_CONFIG="$WORK/backup-falla2.conf" "$HERE/backup.sh" > "$WORK/falla2.log" 2>&1; F2=$?
[ $F2 -ne 0 ] && [ -z "$(ls "$WORK/respaldos-falla2" | grep -E '^(turnero|env|uploads)-')" ] && ok "si falla el cifrado a mitad de camino no queda ningún archivo" || bad "falla a mitad de camino: código $F2, archivos: $(ls "$WORK/respaldos-falla2")"
# el aviso por email sin destinatario o sin SMTP no inventa un envío
(cd "$APP_DIR" && ALERT_TO= node dist/backup/notify.js "prueba" >/dev/null 2>&1); [ $? -ne 0 ] && ok "notify sin ALERT_TO avisa que no hay a quién enviar" || bad "notify dijo que envió sin destinatario"

echo "== 10. Chequeo de antigüedad del último respaldo"
printf 'BACKUP_DIR=%s\nAPP_DIR=%s\nMAX_AGE_HOURS=26\n' "$BACKUP_DIR" "$APP_DIR" > "$WORK/fresh.conf"
BACKUP_CONFIG="$WORK/fresh.conf" "$HERE/check-freshness.sh" >/dev/null 2>&1 && ok "un respaldo de recién da bien" || bad "check-freshness falló con un respaldo reciente"
OLD="$(( $(date +%s) - 30*3600 ))"
mkdir -p "$WORK/viejo"; printf '{"stamp":"20200101-030000","epoch":%s}\n' "$OLD" > "$WORK/viejo/last-success.json"
printf 'BACKUP_DIR=%s\nAPP_DIR=%s\n' "$WORK/viejo" "$APP_DIR" > "$WORK/fresh2.conf"
BACKUP_CONFIG="$WORK/fresh2.conf" "$HERE/check-freshness.sh" >/dev/null 2>&1 && bad "no avisó que el respaldo tiene 30 horas" || ok "avisa cuando el último respaldo tiene más de 26 horas"
mkdir -p "$WORK/vacio"; printf 'BACKUP_DIR=%s\nAPP_DIR=%s\n' "$WORK/vacio" "$APP_DIR" > "$WORK/fresh3.conf"
BACKUP_CONFIG="$WORK/fresh3.conf" "$HERE/check-freshness.sh" >/dev/null 2>&1 && bad "no avisó que no hay ningún respaldo" || ok "avisa cuando nunca hubo un respaldo"

echo "== 11. Copia fuera del servidor (solo si RCLONE_BIN está definido)"
if [ -n "${RCLONE_BIN:-}" ]; then
  export RCLONE_BIN
  REMOTE_DIR="$WORK/remoto"; mkdir -p "$REMOTE_DIR"
  sed -e "s#^BACKUP_DIR=.*#BACKUP_DIR=$WORK/respaldos-remoto#" "$WORK/backup.conf" > "$WORK/backup-remoto.conf"
  echo "REMOTE=$REMOTE_DIR" >> "$WORK/backup-remoto.conf"
  BACKUP_CONFIG="$WORK/backup-remoto.conf" "$HERE/backup.sh" > "$WORK/remoto.log" 2>&1 \
    && ok "backup.sh con copia remota terminó bien" || { bad "backup.sh con copia remota falló"; tail -n 8 "$WORK/remoto.log" | sed 's/^/          /'; }
  LOCAL_N="$(ls "$WORK/respaldos-remoto" | grep -cE '^(turnero|env|uploads)-')"
  REMOTE_N="$(ls "$REMOTE_DIR" | grep -cE '^(turnero|env|uploads)-')"
  [ "$LOCAL_N" -ge 3 ] && [ "$LOCAL_N" = "$REMOTE_N" ] && ok "se copiaron los $REMOTE_N archivos del conjunto" || bad "local $LOCAL_N archivos, remoto $REMOTE_N"
  L="$(sha256sum "$WORK"/respaldos-remoto/turnero-*.sql.gz.age | cut -d' ' -f1)"; R="$(sha256sum "$REMOTE_DIR"/turnero-*.sql.gz.age | cut -d' ' -f1)"
  [ "$L" = "$R" ] && ok "el archivo remoto es idéntico al local (mismo SHA-256)" || bad "el archivo remoto difiere del local"
  # el respaldo copiado fuera del servidor se puede restaurar igual
  restore --file "$(ls "$REMOTE_DIR"/turnero-*.sql.gz.age | head -n 1)" --manifest "$(ls "$REMOTE_DIR"/turnero-*.manifest.json | head -n 1)" \
    --identity "$WORK/clave.txt" --target-db "${RESTORE_DB}_remoto" >/dev/null 2>&1 \
    && ok "la copia remota se restaura y verifica" || bad "la copia remota no se pudo restaurar"
  admin_mysql -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}_remoto\`;" 2>/dev/null
  # destino inválido: el respaldo NO puede darse por bueno
  sed -e "s#^BACKUP_DIR=.*#BACKUP_DIR=$WORK/respaldos-remoto2#" "$WORK/backup.conf" > "$WORK/backup-remoto2.conf"
  echo "REMOTE=destino-que-no-existe:carpeta" >> "$WORK/backup-remoto2.conf"
  BACKUP_CONFIG="$WORK/backup-remoto2.conf" "$HERE/backup.sh" > "$WORK/remoto2.log" 2>&1; R2=$?
  [ $R2 -ne 0 ] && [ ! -f "$WORK/respaldos-remoto2/last-success.json" ] && ok "si la copia remota falla, el respaldo no se da por exitoso" || bad "con el destino remoto roto igual figura como exitoso (código $R2)"
else
  echo "  (omitido: definir RCLONE_BIN para probar la copia remota)"
fi

echo
echo "Resultado: $PASS pruebas correctas, $FAIL con problemas."
[ "$FAIL" -eq 0 ]
