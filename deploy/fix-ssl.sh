#!/bin/bash
# DierCHAT — ручная настройка HTTPS после certbot certonly --standalone
# Запуск: bash fix-ssl.sh

set -e

DOMAIN="dier-chat.ru"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "Сертификат не найден. Сначала выполните:"
  echo "  systemctl stop nginx"
  echo "  certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN --email YOUR_EMAIL --agree-tos --non-interactive"
  exit 1
fi

echo "=== Настройка HTTPS для DierCHAT ==="

cat > /etc/nginx/sites-available/dierchat << 'NGINX'
server {
    listen 80;
    server_name dier-chat.ru www.dier-chat.ru;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
server {
    listen 443 ssl;
    server_name dier-chat.ru www.dier-chat.ru;

    ssl_certificate /etc/letsencrypt/live/dier-chat.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dier-chat.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /ws {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
    location /media {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
    }
}
NGINX

mkdir -p /var/www/html
nginx -t && systemctl reload nginx
echo "HTTPS настроен. Сайт: https://dier-chat.ru"
