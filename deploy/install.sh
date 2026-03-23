#!/bin/bash
# DierCHAT — первая установка (после распаковки deploy-package)
# Запуск: cd /root && unzip -o dierchat-deploy.zip && cd deploy-package && bash install.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== DierCHAT: Первая установка ==="

INSTALL_DIR="/opt/dierchat"
export PATH="${PATH}:/usr/local/go/bin"

# 1. Сборка и деплой (фронт + бэк)
if [ -d "DierCHAT-Desktop" ] && [ -f "DierCHAT-Desktop/package.json" ]; then
  echo "[сборка] полные исходники — deploy-on-host.sh (npm + go)"
  bash deploy-on-host.sh
else
  echo "[сборка] пакет deploy-auto / Windows: готовый web + только Go"
  go build -o dierchat ./cmd/server
  mkdir -p "$INSTALL_DIR"
  systemctl stop dierchat 2>/dev/null || true
  rm -rf "$INSTALL_DIR/web"
  cp dierchat "$INSTALL_DIR/"
  cp -r web "$INSTALL_DIR/"
  if [ -d migrations ]; then
    rm -rf "$INSTALL_DIR/migrations"
    cp -r migrations "$INSTALL_DIR/"
  fi
  if [ -f config.json ]; then
    cp config.json "$INSTALL_DIR/"
  elif [ -f config.production.json ]; then
    cp config.production.json "$INSTALL_DIR/config.json"
  fi
fi

cd "$INSTALL_DIR"

# Config (файлы лежат в deploy-package = SCRIPT_DIR)
if [ ! -f config.json ]; then
  if [ -f "$SCRIPT_DIR/config.json" ]; then
    cp "$SCRIPT_DIR/config.json" .
  elif [ -f "$SCRIPT_DIR/config.production.json" ]; then
    cp "$SCRIPT_DIR/config.production.json" config.json
  fi
  echo "Отредактируйте $INSTALL_DIR/config.json (пароль БД, SMS)"
fi

# Папка для медиа
mkdir -p media

# 2. systemd
cp "$SCRIPT_DIR/dierchat.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable dierchat

# 3. Nginx — http://домен → 127.0.0.1:9000 (порт 9000 снаружи не открываем)
cp "$SCRIPT_DIR/nginx-dierchat.conf" /etc/nginx/sites-available/dierchat
ln -sf /etc/nginx/sites-available/dierchat /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t && systemctl reload nginx
echo "Nginx: HTTP → бэкенд :9000. Сайт: http://dier-chat.ru (HTTPS по желанию: certbot)."

# 4. Запуск
systemctl start dierchat
systemctl status dierchat --no-pager

echo ""
echo "=== Установка завершена ==="
echo "1. certbot --nginx -d dier-chat.ru -d www.dier-chat.ru"
echo "2. Сайт: https://dier-chat.ru"
echo ""
