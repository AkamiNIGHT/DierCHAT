# DierCHAT — Загрузка архива и подключение домена

## 1. Подключение проекта к домену (DNS)

Домен **dier-chat.ru** привязан к серверу через DNS-записи.

### Шаги

1. Зайдите на https://dns.time-host.net  
2. Логин и пароль: **из письма Time-Host** (раздел DNS)  
3. Добавьте домен: **dier-chat.ru**, тип **master**  
4. Создайте A-записи:

   | Тип | Имя | Значение    |
   |-----|-----|-------------|
   | A   | @   | 31.148.99.40 |
   | A   | www | 31.148.99.40 |

5. Подождите 5–15 минут обновления DNS

---

## 2. Загрузка архива на сервер

### Вариант А: SCP (командная строка)

В **cmd** на вашем ПК:

```batch
cd c:\Users\User\Desktop\DierCHAT
scp dierchat-deploy.zip root@31.148.99.40:/root/
```

Пароль root: из письма Time-Host. После ввода пароля архив окажется в `/root/` на сервере.

---

### Вариант Б: WinSCP (с графическим интерфейсом)

1. Скачайте WinSCP: https://winscp.net  
2. Запустите, нажмите «Новая сессия»  
3. Укажите:
   - Хост: **31.148.99.40**
   - Пользователь: **root**
   - Пароль: из письма  
4. Нажмите «Войти»  
5. Слева откройте `c:\Users\User\Desktop\DierCHAT`  
6. Справа откройте папку `/root`  
7. Перетащите **dierchat-deploy.zip** в правую часть

---

### Вариант В: FileZilla (SFTP)

1. Скачайте FileZilla: https://filezilla-project.org  
2. В поле «Хост» введите: **sftp://31.148.99.40**  
3. Пользователь: **root**, пароль: из письма  
4. Порт: **22**  
5. Нажмите «Быстрое соединение»  
6. Слева: `c:\Users\User\Desktop\DierCHAT`  
7. Справа: `/root`  
8. Перетащите **dierchat-deploy.zip** на сервер

---

## 3. Установка на сервере

Подключитесь по SSH:

```batch
ssh root@31.148.99.40
```

Затем выполните:

```bash
cd /root
unzip -o dierchat-deploy.zip
cd deploy-package
bash setup-server.sh
bash install.sh
```

---

## 4. Проверка и HTTPS

После установки откройте http://dier-chat.ru — должен открыться мессенджер.

Для HTTPS на сервере выполните:

```bash
certbot --nginx -d dier-chat.ru -d www.dier-chat.ru
```

---

## Публичный адрес (не IP в ссылках на файлы)

Пользователи заходят на **`https://dier-chat.ru`**, а не на `http://31.148.99.40:9000`.

1. **DNS** — A-записи `@` и `www` указывают на IP сервера (как в таблице выше).  
2. **Nginx** — проксирует на `127.0.0.1:9000`, см. `deploy/nginx-dierchat.conf` (`server_name dier-chat.ru`).  
3. **Бэкенд** — в `DierCHAT-Server/config.json` на сервере должно быть:
   ```json
   "cdn_base_url": "https://dier-chat.ru/media"
   ```
   Тогда ссылки на загруженные файлы в сообщениях будут с доменом, а не с IP.  
4. **Фронт** — в коде используется `window.location.origin` на проде; старые ссылки с IP или `http://` на `dier-chat.ru` нормализуются в относительные пути.

---

## Кратко

| Действие            | Где                        |
|---------------------|----------------------------|
| Настройка DNS       | https://dns.time-host.net  |
| Загрузка архива     | SCP / WinSCP / FileZilla   |
| Установка           | SSH → unzip → setup → install |
| HTTPS               | SSH → certbot              |
| Домен в медиа       | `cdn_base_url` → `https://dier-chat.ru/media` |
