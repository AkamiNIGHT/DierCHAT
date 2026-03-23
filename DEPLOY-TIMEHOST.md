# DierCHAT — Деплой на Time-Host (dier-chat.ru)

## Что делаете ВЫ — что делают скрипты

| № | Вы делаете | Скрипты делают |
|---|------------|----------------|
| 1 | Подключаетесь по SSH | — |
| 2 | Запускаете setup-server.sh | Установка Go, PostgreSQL, Redis, Nginx |
| 3 | Настраиваете DNS | — |
| 4 | Загружаете dierchat-deploy.zip | deploy.bat собирает и пакует |
| 5 | Распаковываете и запускаете install.sh | Установка в /opt, systemd, nginx |
| 6 | certbot для HTTPS | — |

### Автовыгрузка с Windows (`deploy-auto.bat`)

Из папки проекта (двойной клик или `cmd`):

```bat
deploy-auto.bat
```

- Собирает фронт (`npm run build:web`), вызывает **`pack-deploy.ps1`** (папка `deploy-package` + **`dierchat-deploy.zip`** в корне проекта), заливает архив на сервер по **SCP**, на хосте выполняет **`update-on-server.sh`** → **`full-update-on-server.sh`** (пересборка Go, копирование `web`, nginx, `systemctl restart dierchat`).

Только обновить ZIP без выгрузки: после `npm run build:web` в `DierCHAT-Desktop` выполните **`powershell -File pack-deploy.ps1`** из корня репозитория. В архиве: актуальные **`nginx-dierchat.conf`**, **`config.json`** из `DierCHAT-Server` или `deploy/secrets.local.json`, плюс **`dier-chat.ru.md`**, **`HOSTING.md`**, **`Caddyfile.example`**.
- **Первая установка** сервера (apt, БД, nginx, `install.sh`):  
  `deploy-auto.bat --first`  
  Обычные обновления — без `--first`.

Настройка адреса: в начале `deploy-auto.bat` переменные `DEPLOY_HOST` / `DEPLOY_USER`, либо файл **`deploy-host.env`** (скопируйте из `deploy-host.env.example`).

---

## Шаг 1. Подключение к серверу (ВЫ)

```bash
ssh root@31.148.99.40
```

---

## Шаг 2. Первый запуск setup-server.sh (ВЫ)

На сервере:

```bash
# Создаём папку и скачиваем setup (или создайте файл вручную)
mkdir -p /root/setup
cd /root/setup
```

Скопируйте содержимое `deploy/setup-server.sh` в файл `/root/setup/setup-server.sh` (можно через `nano setup-server.sh` и вставку), затем:

```bash
chmod +x setup-server.sh
bash setup-server.sh
```

Скрипт установит Go, PostgreSQL, Redis, Nginx и создаст БД. Запомните пароль БД: `dierchat_secure_pass` (или тот, что указан в выводе).

---

## Шаг 3. DNS (ВЫ)

1. Откройте https://dns.time-host.net  
2. Войдите (логин/пароль из письма)  
3. Создайте домен `dier-chat.ru`, тип **master**  
4. A-запись: `@` → `31.148.99.40`  
5. A-запись: `www` → `31.148.99.40`  

Подождите 5–15 минут распространения DNS.

---

## Шаг 4. Сборка пакета на вашем ПК (ВЫ запускаете скрипт)

На Windows в папке DierCHAT:

```batch
deploy.bat
```

Будет создан файл `dierchat-deploy.zip`.

---

## Шаг 5. Загрузка на сервер (ВЫ)

На вашем ПК (PowerShell или cmd):

```batch
scp dierchat-deploy.zip root@31.148.99.40:/root/
```

---

## Шаг 6. Распаковка и установка (ВЫ запускаете)

На сервере:

```bash
cd /root
unzip -o dierchat-deploy.zip
cd deploy-package

# Если нужен свой пароль БД — отредактируйте config.json
# nano config.json  (поле database.password)

bash install.sh
```

Скрипт соберёт сервер, поставит в `/opt/dierchat`, настроит nginx и запустит DierCHAT.

---

## Шаг 7. HTTPS (ВЫ)

После того как DNS обновится и сайт открывается по http:

```bash
certbot --nginx -d dier-chat.ru -d www.dier-chat.ru
```

Введите email и согласитесь с условиями. Certbot настроит HTTPS автоматически.

---

## Готово

Сайт: **https://dier-chat.ru**

---

## SMS не приходят — что проверить

1. **Баланс SMSC** — зайдите в https://smsc.ru, проверьте баланс.
2. **Имя отправителя (sender)** — в `config.json` поле `sms.sender`:
   - `""` — используется стандартный отправитель SMSC (работает сразу)
   - `"DierCHAT"` — нужно зарегистрировать в SMSC: **Настройки → Имена отправителей**
3. **Логи сервера** — `journalctl -u dierchat -f` — смотрите строки `[SMS]` (ошибки SMSC, успешная отправка).
4. **Формат номера** — поддерживаются `+79...`, `89...`, `79...`.

---

## Обновление после изменений в коде

1. На ПК: `deploy.bat` (создаёт zip с исходниками)
2. `scp dierchat-deploy.zip root@31.148.99.40:/root/`
3. На сервере (сборка на хосте — фронт + бэк):
   ```bash
   cd /root && unzip -o dierchat-deploy.zip && bash deploy-package/deploy-on-host.sh
   ```

Скрипт `deploy-on-host.sh` автоматически: npm install → сборка фронта → сборка Go → копирование в /opt/dierchat → restart.
