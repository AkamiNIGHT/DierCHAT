# Пример Coturn (TURN/STUN) для DierCHAT

Звонки между **разными** сетями без relay часто не проходят (NAT). Нужен **TURN** на VPS с белым IP.

## 1. Установка (Ubuntu)

```bash
sudo apt install coturn
```

## 2. Фрагмент `/etc/turnserver.conf`

```ini
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=dier:ВАШ_СЕКРЕТНЫЙ_ПАРОЛЬ
realm=dierchat
total-quota=100
stale-nonce=600
```

Откройте в firewall **3478** UDP/TCP и при TLS **5349**.

## 3. Клиент (.env.production при сборке)

```env
VITE_WEBRTC_USE_TURN=1
VITE_TURN_URLS=turn:ВАШ_ДОМЕН:3478
VITE_TURN_USERNAME=dier
VITE_TURN_CREDENTIAL=ВАШ_СЕКРЕТНЫЙ_ПАРОЛЬ
```

Пересоберите веб (`npm run build:web`). В клиенте переключатель TURN: **Настройки → Устройства**.

## 4. Проверка

С двух телефонов на **разных** сетях (LTE + домашний Wi‑Fi) — аудио/видео должны соединяться.
