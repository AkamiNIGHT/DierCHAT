# Пересоздание PostgreSQL с сохранением данных

Когда миграции накладывались «с ошибками», проще получить **чистую схему** по всем файлам `migrations/*.sql` и **перелить данные** из старой базы.

## Перед запуском

1. **Обновите сервер** (`full-update` / `deploy-auto`), чтобы в `/opt/dierchat/migrations/` лежали актуальные SQL и бинарник знал ту же схему.
2. В `main.go` порядок миграций должен совпадать с файлами в каталоге (в т.ч. `017_message_forward_from_name.sql`).
3. По возможности **один раз запустите** текущий `dierchat` со **старой** БД, чтобы на источнике применились все `ALTER`/`CREATE`. Иначе при `pg_dump --data-only` колонки могут не совпасть с новой схемой.
4. Остановите сервис:  
   `systemctl stop dierchat`

## Скрипт

Файл в пакете деплоя: **`recreate-db-preserve-data.sh`** (рядом с `full-update-on-server.sh`).

На VDS (из распакованного архива или из `/opt/dierchat`, если скопировали туда):

```bash
cd /root/deploy-package   # или где лежит скрипт
chmod +x recreate-db-preserve-data.sh
sudo bash recreate-db-preserve-data.sh
```

По умолчанию читается **`/opt/dierchat/config.json`**, миграции — **`/opt/dierchat/migrations/`**.

Переменные окружения:

| Переменная    | Назначение |
|---------------|------------|
| `CONFIG`      | Путь к `config.json` |
| `INSTALL_DIR` | Каталог с `migrations/` |
| `BACKUP_ROOT` | Куда положить полный `.dump` (формат custom) |
| `SKIP_RENAME=1` | Только создать БД `*_new_*` и залить данные; имена не менять (ручной режим) |

## Что делает скрипт

1. Полный бэкап старой БД: `pg_dump -Fc` → `BACKUP_ROOT/dierchat_full_<dbname>_<timestamp>.dump`
2. Создаёт пустую БД `<dbname>_new_<timestamp>`
3. Подряд выполняет все `migrations/*.sql` в этой новой БД
4. `pg_dump --data-only` со старой → `psql` в новую
5. Переименовывает: старая → `<dbname>_backup_<timestamp>`, новая → исходное имя из `config` (в `config.json` **ничего менять не нужно**)

## После

```bash
systemctl start dierchat
journalctl -u dierchat -n 80 --no-pager
curl -sS http://127.0.0.1:9000/api/health
```

Если всё ок, через несколько дней можно удалить резервную БД (`DROP DATABASE ...`) и старый `.dump` (или оставить на хранение).

## Откат

- Восстановить из файла `.dump`:  
  `pg_restore -d postgres -C ...` (создать БД из бэкапа) и поправить `dbname` в `config.json`, **или**
- Переименовать БД обратно вручную (`ALTER DATABASE ... RENAME TO ...`), если ещё не удалили `_backup_*`.

## Права

Нужны `CREATE DATABASE`, `ALTER DATABASE ... RENAME`, остановка сессий к БД. Обычно выполняют под **`postgres`** или другим суперпользователем кластера. Пользователь из `config.json` должен быть **владельцем** баз (часто так и есть на простых установках).
