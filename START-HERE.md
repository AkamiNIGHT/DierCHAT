# DierCHAT — с нуля до сайта (dier-chat.ru)

Сделайте шаги **по порядку**. Пароли от Time-Host (root, DNS, панели) — **только из вашего письма**, никуда их не копируйте в чаты.

---

## Что у вас уже есть

- VPS с IP **31.148.99.40** и доменом **dier-chat.ru**
- Проект на ПК: папка `DierCHAT` (с `DierCHAT-Desktop`, `DierCHAT-Server`, скрипты деплоя)

На ПК нужны **Node.js** (LTS) и **Git** не обязателен. Для деплоя удобны **OpenSSH** (в Windows 10/11 обычно уже есть) или **WinSCP**.

---

## Шаг 1. DNS (можно сделать первым, подождать 5–30 минут)

1. Откройте панель DNS из письма Time-Host (ссылка вида `https://dns.time-host.net`).
2. Войдите **логином и паролем из письма** (раздел DNS / DNSmanager).
3. Создайте зону для домена **dier-chat.ru**, тип **master**, в поле IP укажите **31.148.99.40** (как в инструкции хостера).
4. Убедитесь, что есть записи:
   - **A** для **`@`** → `31.148.99.40`
   - **A** для **`www`** → `31.148.99.40`
5. Подождите распространения DNS (от нескольких минут до часа).

Пока DNS «дойдёт», можно делать шаг 2.

---

## Секреты в архиве (SMTP, БД) без правок на сервере

См. **`deploy/SECRETS-BUILD.md`**: файл **`deploy/secrets.local.json`** (копия с **`secrets.local.json.example`**) подставляется в архив как `config.json` и **не коммитится** в Git. Реальные пароли в репозиторий не кладём.

---

## Шаг 2. Собрать архив и **первый** деплой на сервер (Windows)

В проводнике откройте папку проекта, например:

`c:\Users\User\Desktop\DierCHAT`

### Вариант А — всё автоматически (рекомендуется)

1. Дважды нажмите **`deploy-auto.bat --first`** не сработает двойным кликом с аргументом — откройте **cmd**:
   ```bat
   cd /d c:\Users\User\Desktop\DierCHAT
   deploy-auto.bat --first
   ```
2. Скрипт:
   - соберёт фронт (`npm run build`);
   - соберёт **`dierchat-deploy.zip`**;
   - зальёт на сервер (**дважды** спросит пароль **root** — это нормально);
   - на сервере выполнит **``** (долго: Go, PostgreSQL, Redis, nginx…) и **`install.sh`**.

3. Если спросит пароль при **scp** и при **ssh** — введите пароль **root** из письма про VPS.

### Вариант Б — только собрать zip вручную

```bat
cd /d c:\Users\User\Desktop\DierCHAT
rebuild-and-pack.bat
```

Потом залейте `dierchat-deploy.zip` через WinSCP в `/root/` на сервере и по SSH:

```bash
cd /root && unzip -o dierchat-deploy.zip && cd deploy-package
bash setup-server.sh
bash install.sh
```

---

### Вариант А — сайт напрямую `http://31.148.99.40:9000/`

- В **`config.json`** у бэкенда: **`server.host": "0.0.0.0"`**, **`port": 9000** — тогда приложение слушает **все интерфейсы**, заход с браузера по IP и порту.
- **`media.cdn_base_url`**: `http://31.148.99.40:9000/media`
- На сервере откройте порт: **`ufw allow 9000/tcp`** (и перезапуск **`systemctl restart dierchat`**).
- Если конфиг на сервере уже был и архив его не перезаписал: в пакете есть **`set-direct-ip-9000.sh`** — скопируйте на сервер и выполните **`sudo bash set-direct-ip-9000.sh`**.

### Вариант Б — домен без `:9000` (nginx)

- Браузер ходит на **порт 80**.
- **Nginx** проксирует на **127.0.0.1:9000**, в `config` тогда удобно **`127.0.0.1`** для бэкенда.

---

## Шаг 3. После установки

1. Откройте в браузере: **http://dier-chat.ru** (без SSL — это нормально на старте).  
   Если не открывается — подождите DNS; на сервере: `systemctl status dierchat nginx`.

2. **HTTPS (по желанию)** — когда будет готовность настроить сертификат (Let's Encrypt и т.п.):

   ```bash
   certbot --nginx -d dier-chat.ru -d www.dier-chat.ru
   ```

   После этого в **`/opt/dierchat/config.json`** имеет смысл сменить **`media.cdn_base_url`** на `https://dier-chat.ru/media`.

---

## Шаг 4. Безопасность (сделайте в первые дни)

1. Смените пароль **root** на сервере (`passwd`).
2. В файле **`/opt/dierchat/config.json`** на сервере смените **`jwt.secret`** на длинную случайную строку и при необходимости пароль БД (поле **`database.password`**), затем:

   ```bash
   systemctl restart dierchat
   ```

3. Пароли от писем, которые светили в чатах, лучше **сменить** в панелях хостера.

---

## Дальнейшие обновления (когда код уже меняли)

Только обновить сайт **без** полной переустановки:

```bat
cd /d c:\Users\User\Desktop\DierCHAT
deploy-auto.bat
```

В **PowerShell** из папки проекта запускайте с `.\` : `.\deploy-auto.bat` или `.\deploy-auto.bat --fresh` (иначе «команда не найдена»).

(без `--first`)

На сервере выполняется **`full-update-on-server.sh`** (через `update-on-server.sh`): останавливается сервис, **удаляются** старые `web/` и бинарник, копируются новые **фронт**, **бэк** и папка **`migrations/`** (схема БД обновляется при следующем старте). Файл **`/opt/dierchat/config.json`** и папка **`media/`** не затираются.

**Важно:** это **не** удаляет данные PostgreSQL (чаты, пользователи). Полное «обнуление» БД делается отдельно и вручную, если нужно.

---

## Если что-то пошло не так

| Проблема | Что проверить |
|----------|----------------|
| Не открывается сайт | DNS: `ping dier-chat.ru` → **31.148.99.40**; на сервере: `systemctl status dierchat`, `nginx -t` |
| **Яндекс: connectionfailure по `http://31.148.99.40/`** | Это не DNS — **нет соединения с портом 80**. См. блок ниже «Порт 80 не открывается». |
| Ошибка при деплое | Лог: `journalctl -u dierchat -n 50 --no-pager` |
| **`invalid character ',' after top-level value` в логе dierchat** | В **`/opt/dierchat/config.json`** сломан JSON (два `{...}` подряд, лишняя `,`). Проверка: `python3 -m json.tool /opt/dierchat/config.json`. Исправьте файл или скопируйте валидный из **`deploy-package/config.json`** после unzip, затем **`systemctl restart dierchat`**. Скрипт **`full-update-on-server.sh`** теперь сам находит битый JSON и подставляет конфиг из пакета (старый в **`config.json.broken.*`**). |
| **`scp` прошёл, `ssh: Permission denied`** | Часто клиент перебирает ключи и упирается в лимит на сервере. В **`deploy-auto.bat`** уже стоит **`PubkeyAuthentication=no`** для входа паролем. Вход по ключу: в **`deploy-host.env`** строка **`USE_SSH_KEY=1`**. Или выполните команду обновления вручную (см. вывод bat при ошибке). |
| «Text file busy» при обновлении | Свежий `dierchat-deploy.zip` (скрипт останавливает сервис перед копированием) |
| `apt` / **Fastpanel** при `setup-server.sh` | На сервере: `dpkg --configure -a` или `apt -f install`. Затем снова `bash setup-server.sh` и `bash install.sh` из `deploy-package` |
| **Не приходит код на почту** | См. блок ниже «Почта (SMTP)» |

Подробнее: **`UPLOAD-AND-DOMAIN.md`**, **`DEPLOY-TIMEHOST.md`**.

---

## Порт 80 не открывается (connection failure, Яндекс.Браузер)

Значение **connection failure** / **ошибка соединения** по **`http://31.148.99.40/`** — браузер **не достучался до сервера на порт 80** (ещё не HTTP и не nginx).

**На VPS по SSH выполните по очереди:**

```bash
# Слушает ли что-то порт 80?
ss -tlnp | grep ':80 '

# Nginx и DierCHAT
systemctl status nginx --no-pager
systemctl status dierchat --no-pager

# Локально на сервере (должен быть ответ от бэкенда)
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/

# Через nginx
curl -sS -o /dev/null -w "%{http_code}\n" -H "Host: dier-chat.ru" http://127.0.0.1/
```

**Если порт 80 никто не слушает** — установите/запустите nginx, примените конфиг из деплоя (`install.sh` копирует `nginx-dierchat.conf`), затем `nginx -t && systemctl reload nginx`.

**Если слушает, но с вашего ПК всё равно connection failure** — чаще всего **файрвол**:

```bash
ufw status
# если активен и 80 закрыт:
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

На **FASTpanel** или в **панели хостера** проверьте, не блокируется ли входящий **80/tcp** (иногда отдельная «сетевая политика» / security group).

**Заход по IP:** в `nginx-dierchat.conf` в `server_name` должен быть и ваш IP (в репозитории добавлен **31.148.99.40**). После правки на сервере: `nginx -t && systemctl reload nginx`.

---

## Почта (SMTP) — код входа не приходит

Код отправляет **бэкенд** с VPS по SMTP из **`/opt/dierchat/config.json`** (блок **`smtp`**: `host`, `port`, `login`, `password`, `from`).

1. **Проверьте конфиг на сервере** — после правок: `systemctl restart dierchat`.
2. **Если в логе при старте** есть строка *«SMTP не задан»* — в конфиге пустые `host`/`from` или `login`/`password`. Тогда приложение **не шлёт письма**, а код пишется **только в лог** (`journalctl -u dierchat`).
3. **Gmail** — нужен **пароль приложения** (App Password), не обычный пароль аккаунта; в аккаунте Google включите 2FA и создайте пароль для «Почта».
4. **Сеть** — с VPS должен быть **исходящий** доступ на порт **587** (или **465**) к вашему SMTP-хосту (часто блокируют на дешёвых VPS — уточните у хостера).
5. **Диагностика** — после запроса кода на сайте смотрите лог:
   ```bash
   journalctl -u dierchat -n 80 --no-pager
   ```
   Ищите строки `[Email] sent` (успех), `send email:` / `email auth:` / `email dial:` (ошибка), или `[AUTH] Verification code` (режим без SMTP).
6. **Письмо могло уйти в «Спам»** — если в логе есть `sent`, проверьте папку спама у получателя.

**Важно:** не храните реальные пароли SMTP в открытом репозитории; на проде правьте только **`config.json` на сервере**.
