#!/usr/bin/env bash
# =============================================================================
# DierCHAT — пересоздать PostgreSQL БД «с нуля» по текущим migrations/*.sql
# и перенести ВСЕ данные со старой БД (тот же dbname в config — после скрипта
# имя базы не меняется: старая переименовывается в *_backup_*, новая получает
# исходное имя).
#
# ВАЖНО:
#   • Запускайте от суперпользователя PostgreSQL или от пользователя с правом
#     CREATEDB и правами на обе базы (часто postgres / sudo -u postgres).
#   • На ИСХОДНОЙ базе желательно уже применить все миграции (один запуск
#     актуального dierchat), иначе pg_dump --data-only может не совпасть по
#     колонкам с новой схемой (особенно user_stickers.pack_id и т.п.).
#   • Остановите сервис: systemctl stop dierchat
#
# Использование:
#   sudo bash recreate-db-preserve-data.sh
#   CONFIG=/opt/dierchat/config.json INSTALL_DIR=/opt/dierchat sudo -E bash recreate-db-preserve-data.sh
#
# Переменные:
#   CONFIG       — путь к config.json (по умолчанию /opt/dierchat/config.json)
#   INSTALL_DIR  — где лежат migrations/ (по умолчанию /opt/dierchat)
#   BACKUP_ROOT  — каталог для полного дампа (по умолчанию /root/dierchat-db-backups)
#   SKIP_RENAME  — если=1: только создать *_new_* и залить данные, не менять имена БД
# =============================================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/dierchat}"
CONFIG="${CONFIG:-$INSTALL_DIR/config.json}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/dierchat-db-backups}"
SKIP_RENAME="${SKIP_RENAME:-0}"

MIG_DIR="$INSTALL_DIR/migrations"

if [[ ! -f "$CONFIG" ]]; then
  echo "Ошибка: нет $CONFIG"
  exit 1
fi
if [[ ! -d "$MIG_DIR" ]]; then
  echo "Ошибка: нет каталога миграций $MIG_DIR (обновите сервер / full-update)"
  exit 1
fi

command -v psql >/dev/null || { echo "Ошибка: нужен psql (postgresql-client)"; exit 1; }
command -v pg_dump >/dev/null || { echo "Ошибка: нужен pg_dump"; exit 1; }
command -v python3 >/dev/null || { echo "Ошибка: нужен python3 для чтения config.json"; exit 1; }

read_db_cfg() {
  python3 - "$CONFIG" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    c = json.load(f)
d = c["database"]
for k in ("host", "port", "user", "password", "dbname"):
    v = d[k]
    if k == "port":
        v = str(int(v))
    print(v)
PY
}

mapfile -t _db < <(read_db_cfg)
PGHOST="${_db[0]}"
PGPORT="${_db[1]}"
PGUSER="${_db[2]}"
PGPASSWORD="${_db[3]}"
OLD_DBNAME="${_db[4]}"
export PGPASSWORD

# Безопасные идентификаторы в SQL (буквы, цифры, подчёркивание)
if [[ ! "$OLD_DBNAME" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
  echo "Ошибка: в config database.dbname должно быть простое имя (например dierchat), без пробелов и спецсимволов."
  exit 1
fi
if [[ ! "$PGUSER" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
  echo "Ошибка: database.user — простой идентификатор PostgreSQL."
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
NEW_DBNAME="${OLD_DBNAME}_new_${TS}"
BACKUP_NAME="dierchat_full_${OLD_DBNAME}_${TS}.dump"
mkdir -p "$BACKUP_ROOT"

echo "=== DierCHAT: пересоздание БД с переносом данных ==="
echo "    config:  $CONFIG"
echo "    host:    $PGHOST:$PGPORT"
echo "    user:    $PGUSER"
echo "    old db:  $OLD_DBNAME"
echo "    new db:  $NEW_DBNAME (временное имя)"
echo "    миграции: $MIG_DIR"
echo ""

# Проверка подключения
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null

echo "==> [1/6] Полный бэкап текущей БД (custom format) -> $BACKUP_ROOT/$BACKUP_NAME"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "$BACKUP_ROOT/$BACKUP_NAME" "$OLD_DBNAME"

echo "==> [2/6] Создание пустой БД: $NEW_DBNAME"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE $NEW_DBNAME OWNER $PGUSER;"

echo "==> [3/6] Применение миграций (пустая схема)"
shopt -s nullglob
mig_files=( "$MIG_DIR"/*.sql )
IFS=$'\n' mig_sorted=( $(printf '%s\n' "${mig_files[@]}" | sort) )
if [[ ${#mig_sorted[@]} -eq 0 ]]; then
  echo "Ошибка: в $MIG_DIR нет *.sql"
  exit 1
fi
for f in "${mig_sorted[@]}"; do
  echo "    $(basename "$f")"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$NEW_DBNAME" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "==> [4/6] Копирование данных (data-only) $OLD_DBNAME -> $NEW_DBNAME"
# Один проход: данные в порядке зависимостей выдаёт pg_dump
set +e
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --data-only --no-owner --no-acl "$OLD_DBNAME" \
  | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$NEW_DBNAME" -v ON_ERROR_STOP=1
DATA_RC=${PIPESTATUS[0]}
PSQL_RC=${PIPESTATUS[1]}
set -e
if [[ "$DATA_RC" -ne 0 ]] || [[ "$PSQL_RC" -ne 0 ]]; then
  echo ""
  echo "ОШИБКА: перенос данных не удалён (pg_dump=$DATA_RC psql=$PSQL_RC)."
  echo "Полный бэкап сохранён: $BACKUP_ROOT/$BACKUP_NAME"
  echo "Новую БД можно удалить: DROP DATABASE $NEW_DBNAME;"
  exit 1
fi

if [[ "$SKIP_RENAME" == "1" ]]; then
  echo ""
  echo "==> SKIP_RENAME=1 — имена БД не трогаем."
  echo "    Новая база: $NEW_DBNAME"
  echo "    Впишите в $CONFIG database.dbname = \"$NEW_DBNAME\" и перезапустите dierchat,"
  echo "    либо вручную переименуйте БД и верните dbname."
  exit 0
fi

BACKUP_DBNAME="${OLD_DBNAME}_backup_${TS}"

echo "==> [5/6] Переключение: $OLD_DBNAME -> $BACKUP_DBNAME, $NEW_DBNAME -> $OLD_DBNAME"
# Закрыть соединения (dierchat должен быть остановлен)
for DB in "$OLD_DBNAME" "$NEW_DBNAME"; do
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" \
    >/dev/null || true
done

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE $OLD_DBNAME RENAME TO $BACKUP_DBNAME;"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE $NEW_DBNAME RENAME TO $OLD_DBNAME;"

echo "==> [6/6] Готово."
echo "    Активная БД: $OLD_DBNAME (новая схема + ваши данные)"
echo "    Старая копия: $BACKUP_DBNAME (можно удалить после проверки)"
echo "    Файл дампа:   $BACKUP_ROOT/$BACKUP_NAME"
echo ""
echo "Запустите: systemctl start dierchat"
echo "Проверка: curl -sS http://127.0.0.1:9000/api/health"
