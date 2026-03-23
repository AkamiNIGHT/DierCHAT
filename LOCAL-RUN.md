# Локальный запуск DierCHAT

## 1. Запуск БД (Docker)

```powershell
cd DierCHAT-Server
docker compose -f docker-compose.local.yml up -d
```

Подождите 5–10 секунд, пока PostgreSQL и Redis запустятся.

## 2. Остановка старого сервера (если порт 9000 занят)

Найдите процесс на порту 9000:
```powershell
netstat -ano | findstr ":9000"
```

Остановите его (замените PID на номер из вывода):
```powershell
taskkill /PID <PID> /F
```

## 3. Запуск сервера

```powershell
cd DierCHAT-Server
$env:DIERCHAT_CONFIG = "config.local.json"
go run ./cmd/server
```

## 4. Запуск фронтенда (в **новом** терминале)

```powershell
cd C:\Users\User\Desktop\DierCHAT\DierCHAT-Desktop
npm run dev
```

---

**Важно:** На порту 5432 может быть локальный PostgreSQL.  
Docker PostgreSQL слушает **5433**, Redis — **6379**.
