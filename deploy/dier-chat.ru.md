# dier-chat.ru — продакшен

| | |
|--|--|
| **Домен** | `dier-chat.ru` (и при необходимости `www.dier-chat.ru`) |
| **VDS** | `31.148.99.40` |
| **Бэкенд** | Go слушает `0.0.0.0:9000`, за Nginx/Caddy — HTTPS наружу |

## DNS (панель Time-Host / DNSmanager)

- Тип **A**: имя `@` (или `dier-chat.ru`) → **31.148.99.40**
- По желанию **A**: `www` → **31.148.99.40**

NS у регистратора/хостинга: как в письме провайдера (`ns1.time-host.net`, `ns2.time-host.net`), если выбран их DNS.

## На сервере

1. Собрать фронт, положить в `DierCHAT-Server/web/` (см. `deploy/HOSTING.md`).
2. `media.cdn_base_url` в `config.json`: **`https://dier-chat.ru/media`** (уже в репозитории).
3. Nginx по примеру `deploy/nginx/dierchat.conf` — прокси на `127.0.0.1:9000`, затем certbot для TLS.
4. Пока домен не ведёт на сервер или нет TLS, временно можно выставить `CDN_BASE_URL=http://31.148.99.40:9000/media` в окружении процесса — после включения HTTPS верните `https://dier-chat.ru/media`.

Фронт на **одном домене** с API не требует `VITE_*` при сборке.
