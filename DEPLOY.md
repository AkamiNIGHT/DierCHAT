# Развёртывание DierCHAT на хостинге

## Переменные окружения (для production)

Установите на сервере перед запуском:

```bash
# База данных
export DB_HOST=localhost          # или IP PostgreSQL
export DB_PORT=5432
export DB_USER=dierchat
export DB_PASSWORD=ваш_пароль
export DB_NAME=dierchat

# Redis (опционально, для кэша/сессий)
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export REDIS_PASSWORD=

# JWT (обязательно на production!)
export JWT_SECRET=случайная_строка_32_символа

# SMTP (отправка кодов на email)
export SMTP_LOGIN=dier.groups@gmail.com
export SMTP_PASSWORD=app_password_из_google
export SMTP_FROM=dier.groups@gmail.com

# CDN/медиа (если раздаёте через nginx/CDN)
export CDN_BASE_URL=https://dier-chat.ru/media
```

## Локальный запуск

1. **PostgreSQL** — порт 5432:
   ```bash
   # Создать БД и пользователя
   createdb dierchat
   createuser -P dierchat  # пароль: dierchat
   ```

2. **Redis** (опционально):
   ```bash
   redis-server
   ```

3. **Запуск сервера:**
   ```bash
   cd DierCHAT-Server
   go run ./cmd/server
   ```

4. **Фронтенд:**
   ```bash
   cd DierCHAT-Desktop
   npm run dev
   ```

## Конфиг

- `config.json` — локальная разработка
- `deploy/config.production.json` — production (или используйте env-переменные)
- `DIERCHAT_CONFIG=/path/to/config.json` — путь к конфигу
