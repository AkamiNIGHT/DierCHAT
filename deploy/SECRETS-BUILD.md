# Секреты в архиве деплоя (без коммита в Git)

Чтобы на сервере сразу был рабочий `config.json` **без ручного ввода паролей по SSH**:

1. Скопируйте файл:
   ```text
   deploy\secrets.local.json.example  →  deploy\secrets.local.json
   ```
2. Откройте `deploy\secrets.local.json` в редакторе и подставьте **свои** значения:
   - `database.password` — как в PostgreSQL на VPS (после `setup-server.sh` / как задавали).
   - `jwt.secret` — длинная случайная строка.
   - `smtp` — Gmail: **пароль приложения** без пробелов.
   - `sms` — логин/пароль SMSC, если нужны SMS.

3. Запустите сборку архива:
   ```bat
   powershell -NoProfile -ExecutionPolicy Bypass -File pack-deploy.ps1
   ```
   или `deploy-auto.bat` (он тоже вызывает `pack-deploy.ps1`).

Файл **`deploy/secrets.local.json`** указан в **`.gitignore`** — в репозиторий не попадёт.

Приоритет в **`pack-deploy.ps1`**: **`deploy/secrets.local.json`** → иначе **`DierCHAT-Server/config.json`** (копируется **как есть**) → иначе **`deploy/config.production.json`**.  
**`DierCHAT-Server/config.json`** в **`.gitignore`**, чтобы секреты не уходили в Git.

Если **`secrets.local.json` нет**, в архив кладётся обычный **`config.production.json`** с плейсхолдерами.

### Полная переустановка с конфигом из архива на сервере

После unzip: **`bash fresh-deploy-on-server.sh`** — подставляет **`config.json` из архива** в **`/opt/dierchat/`** (старый сохраняется как **`config.json.replaced.*`**).  
С Windows: **`deploy-auto.bat --fresh`** (соберёт проект, зальёт zip и выполнит этот скрипт по SSH).

**Важно:** не отправляйте `secrets.local.json` и `dierchat-deploy.zip` в чаты и публичные репозитории.

## Уже стоит прод: скрипт не затирает `config.json`

`full-update-on-server.sh` **не перезаписывает** существующий **`/opt/dierchat/config.json`**. Новый `config.json` из архива подставится только если на сервере файла ещё не было (первая установка).

Чтобы обновить секреты на работающем сервере: отредактируйте вручную `nano /opt/dierchat/config.json` или один раз залейте файл через `scp`.
