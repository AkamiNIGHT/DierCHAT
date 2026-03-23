#!/bin/bash
# Обновление DierCHAT (совместимость: вызывает полную замену фронта/бэка/миграций)
# Запуск: cd /root && unzip -o dierchat-deploy.zip && bash deploy-package/update-on-server.sh

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$HERE/full-update-on-server.sh"
