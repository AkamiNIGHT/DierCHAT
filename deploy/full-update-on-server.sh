#!/bin/bash
# Полная замена фронта, бэка и SQL-миграций на сервере.
# REPLACE_CONFIG_FROM_PACKAGE=1 — всегда взять config.json из архива (см. fresh-deploy-on-server.sh).
# После распаковки: bash deploy-package/full-update-on-server.sh
# Или из корня: cd /root && unzip -o dierchat-deploy.zip && bash deploy-package/full-update-on-server.sh

set -euo pipefail

cd /root
# Только deploy-package (не «deploy*» — иначе при папке /root/deploy выбиралось неверно)
if [ -d "deploy-package" ] && [ -f "deploy-package/go.mod" ]; then
  DEPLOY_DIR="deploy-package"
else
  DEPLOY_DIR=$(find . -maxdepth 1 -type d -name "deploy-package" 2>/dev/null | head -1)
fi
if [ -z "$DEPLOY_DIR" ] || [ ! -f "$DEPLOY_DIR/go.mod" ]; then
  echo "Ошибка: папка deploy-package или go.mod не найдены. Распакуйте dierchat-deploy.zip в /root"
  ls -la
  exit 1
fi

cd "$DEPLOY_DIR"
SCRIPT_DIR="$(pwd)"
INSTALL_DIR="/opt/dierchat"

echo "=== DierCHAT: полное обновление в: $SCRIPT_DIR ==="
ls -la go.mod web 2>/dev/null || true

export PATH="${PATH}:/usr/local/go/bin"
command -v go >/dev/null 2>&1 || { echo "Ошибка: go не найден. Запустите setup-server.sh или установите Go."; exit 1; }
go version

go mod download 2>/dev/null || true
if ! go build -o dierchat ./cmd/server; then
  echo "=== ОШИБКА: go build ==="
  exit 1
fi

echo "=== Остановка сервиса и удаление старых файлов приложения ==="
systemctl stop dierchat 2>/dev/null || true

mkdir -p "$INSTALL_DIR"

# Старый фронт (в т.ч. старые chunk-хэши) — полностью убираем
rm -rf "$INSTALL_DIR/web"

# Старый бинарник (избегаем «Text file busy» — сервис уже остановлен)
rm -f "$INSTALL_DIR/dierchat" "$INSTALL_DIR/dierchat.bak"
cp dierchat "$INSTALL_DIR/dierchat"
chmod +x "$INSTALL_DIR/dierchat"

# Новый фронт
cp -r web "$INSTALL_DIR/"

# Миграции БД — сервер читает migrations/ из WorkingDirectory=/opt/dierchat
if [ -d "migrations" ]; then
  rm -rf "$INSTALL_DIR/migrations"
  cp -r migrations "$INSTALL_DIR/"
  echo "Миграции скопированы в $INSTALL_DIR/migrations"
else
  echo "ВНИМАНИЕ: папка migrations не найдена в пакете — схема БД может не обновиться."
fi

# Конфиг: при REPLACE_CONFIG_FROM_PACKAGE=1 — всегда из пакета (бэкап старого)
if [ "${REPLACE_CONFIG_FROM_PACKAGE:-}" = "1" ]; then
  if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo "ОШИБКА: в пакете нет config.json"
    exit 1
  fi
  if [ -f "$INSTALL_DIR/config.json" ]; then
    cp -a "$INSTALL_DIR/config.json" "$INSTALL_DIR/config.json.replaced.$(date +%Y%m%d%H%M%S)"
  fi
  cp "$SCRIPT_DIR/config.json" "$INSTALL_DIR/config.json"
  if ! python3 -c "import json; json.load(open('$INSTALL_DIR/config.json', encoding='utf-8'))" 2>/dev/null; then
    echo "ОШИБКА: config.json в архиве — невалидный JSON"
    exit 1
  fi
  echo "Конфиг заменён из архива (REPLACE_CONFIG_FROM_PACKAGE=1). Старый: config.json.replaced.*"
elif [ ! -f "$INSTALL_DIR/config.json" ]; then
  if [ -f "$SCRIPT_DIR/config.json" ]; then
    cp "$SCRIPT_DIR/config.json" "$INSTALL_DIR/"
  elif [ -f "$SCRIPT_DIR/config.production.json" ]; then
    cp "$SCRIPT_DIR/config.production.json" "$INSTALL_DIR/config.json"
  fi
  echo "Создан новый config.json — отредактируйте $INSTALL_DIR/config.json"
else
  if ! python3 -c "import json; json.load(open('$INSTALL_DIR/config.json', encoding='utf-8'))" 2>/dev/null; then
    echo "ОШИБКА: $INSTALL_DIR/config.json — битый JSON (часто два блока { } подряд). Делаю бэкап и подставляю из пакета."
    cp -a "$INSTALL_DIR/config.json" "$INSTALL_DIR/config.json.broken.$(date +%Y%m%d%H%M%S)"
    if [ -f "$SCRIPT_DIR/config.json" ]; then
      cp "$SCRIPT_DIR/config.json" "$INSTALL_DIR/config.json"
    elif [ -f "$SCRIPT_DIR/config.production.json" ]; then
      cp "$SCRIPT_DIR/config.production.json" "$INSTALL_DIR/config.json"
    else
      echo "Нет config.json в пакете — восстановите вручную."
      exit 1
    fi
    echo "ВНИМАНИЕ: Впишите в $INSTALL_DIR/config.json свои пароли БД, JWT, SMTP (см. бэкап config.json.broken.*)."
  fi
fi

mkdir -p "$INSTALL_DIR/media"

# Обновить unit и nginx из пакета (без поломки сайта при ошибке nginx)
if [ -f "$SCRIPT_DIR/dierchat.service" ]; then
  cp -f "$SCRIPT_DIR/dierchat.service" /etc/systemd/system/dierchat.service
  systemctl daemon-reload
fi
if [ -f "$SCRIPT_DIR/nginx-dierchat.conf" ]; then
  cp -f "$SCRIPT_DIR/nginx-dierchat.conf" /etc/nginx/sites-available/dierchat
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
  else
    echo "ВНИМАНИЕ: nginx -t не прошёл — конфиг nginx не применён. Проверьте вручную."
  fi
fi

echo "=== Запуск dierchat (миграции применятся при старте) ==="
if ! systemctl start dierchat; then
  echo "=== systemctl start dierchat failed — последние логи: ==="
  journalctl -u dierchat -n 80 --no-pager 2>/dev/null || true
  exit 1
fi

sleep 2
systemctl is-active --quiet dierchat && echo "Сервис: active" || echo "Проверьте: systemctl status dierchat"

echo ""
echo "=== Готово. Логи (миграции, ошибки): ==="
journalctl -u dierchat -n 40 --no-pager 2>/dev/null || true
