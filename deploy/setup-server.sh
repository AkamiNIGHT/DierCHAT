#!/bin/bash
# DierCHAT — автоматическая настройка сервера (Ubuntu/Debian)
# Запуск: bash setup-server.sh
set -e

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "=== DierCHAT: Установка ПО на сервер ==="

# Обновление (upgrade не прерывает скрипт при ошибках сторонних пакетов; Fastpanel и др.)
apt update
apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade || true

# Go 1.22
if ! command -v go &> /dev/null; then
  echo "Установка Go..."
  wget -q https://go.dev/dl/go1.22.4.linux-amd64.tar.gz -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /root/.bashrc
  export PATH=$PATH:/usr/local/go/bin
  rm /tmp/go.tar.gz
fi

# PostgreSQL
if ! command -v psql &> /dev/null; then
  echo "Установка PostgreSQL..."
  apt install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

# Redis
if ! command -v redis-cli &> /dev/null; then
  echo "Установка Redis..."
  apt install -y redis-server
  systemctl enable redis-server
  systemctl start redis-server
fi

# Node.js (для сборки фронтенда на хосте)
if ! command -v node &> /dev/null; then
  echo "Установка Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

# Nginx + Certbot + unzip
apt install -y nginx certbot python3-certbot-nginx unzip 2>/dev/null || true
if ! command -v nginx &> /dev/null; then
  echo "Установка Nginx..."
  apt install -y nginx certbot python3-certbot-nginx unzip
fi

echo ""
echo "=== Создание БД PostgreSQL ==="
DB_PASS="${DIERCHAT_DB_PASSWORD:-dierchat_secure_pass}"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='dierchat'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER dierchat WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='dierchat'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE dierchat OWNER dierchat;"

echo "Пароль БД: $DB_PASS (сохраните для config.json)"
echo ""
echo "=== Готово! Теперь: ==="
echo "1. Загрузите dierchat-deploy.zip на сервер"
echo "2. unzip dierchat-deploy.zip && cd deploy-package"
echo "3. Отредактируйте config.json (пароль БД)"
echo "4. bash install.sh"
echo ""
