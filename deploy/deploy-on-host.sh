#!/bin/bash
# DierCHAT — полная сборка и деплой на хосте
# Запуск: cd /root && unzip -o dierchat-deploy.zip && bash deploy-package/deploy-on-host.sh
# Или: bash deploy-on-host.sh (из папки deploy-package)
set -e

ROOT="/root"
cd "$ROOT"

# Папка deploy-package (не deploy* — конфликт с каталогом deploy)
if [ -d "deploy-package" ]; then
  DEPLOY_DIR="deploy-package"
else
  DEPLOY_DIR=$(find . -maxdepth 1 -type d -name "deploy-package" 2>/dev/null | head -1)
fi
if [ -z "$DEPLOY_DIR" ]; then
  # Возможно, скрипт вызван из папки deploy-package
  if [ -f "deploy-on-host.sh" ] && [ -d "DierCHAT-Desktop" ]; then
    DEPLOY_DIR="."
  else
    echo "Ошибка: папка deploy-package не найдена. Распакуйте dierchat-deploy.zip в /root"
    exit 1
  fi
fi

cd "$DEPLOY_DIR"
echo "=== DierCHAT: Сборка в $(pwd) ==="

DESKTOP="DierCHAT-Desktop"
SERVER="DierCHAT-Server"
INSTALL_DIR="/opt/dierchat"

# Проверка структуры
if [ ! -d "$DESKTOP" ] || [ ! -f "$DESKTOP/package.json" ]; then
  echo "Ошибка: $DESKTOP не найден или неверная структура"
  ls -la
  exit 1
fi
if [ ! -f "$SERVER/go.mod" ]; then
  echo "Ошибка: $SERVER/go.mod не найден"
  exit 1
fi

# 1. Сборка фронтенда
echo "[1/4] Сборка фронтенда..."
cd "$DESKTOP"
if [ ! -d "node_modules" ]; then
  npm ci 2>/dev/null || npm install
fi
npm run build:web
cd ..

# 2. Копирование web в Server
echo "[2/4] Копирование web..."
mkdir -p "$SERVER/web"
rm -rf "$SERVER/web"/*
cp -r "$DESKTOP/dist/renderer"/* "$SERVER/web/"

# 3. Сборка Go
echo "[3/4] Сборка сервера..."
cd "$SERVER"
export PATH="${PATH}:/usr/local/go/bin"
go build -o dierchat ./cmd/server
cd ..

# 4. Деплой
echo "[4/4] Деплой в $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
systemctl stop dierchat 2>/dev/null || true
rm -rf "$INSTALL_DIR/web"
cp "$SERVER/dierchat" "$INSTALL_DIR/"
cp -r "$SERVER/web" "$INSTALL_DIR/"
if [ -d "$SERVER/migrations" ]; then
  rm -rf "$INSTALL_DIR/migrations"
  cp -r "$SERVER/migrations" "$INSTALL_DIR/"
fi
if [ -f config.json ]; then
  cp config.json "$INSTALL_DIR/"
elif [ -f config.production.json ]; then
  cp config.production.json "$INSTALL_DIR/config.json"
fi

systemctl start dierchat 2>/dev/null && echo "DierCHAT перезапущен." || echo "ВНИМАНИЕ: systemctl start не выполнен (первый запуск? выполните install.sh)"

echo ""
echo "=== Готово ==="
