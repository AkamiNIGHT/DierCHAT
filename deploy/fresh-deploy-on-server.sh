#!/bin/bash
# «С нуля»: удалить web/бинарник/миграции в /opt/dierchat, подставить config.json ИЗ АРХИВА, собрать и запустить.
# После unzip: bash deploy-package/fresh-deploy-on-server.sh

set -euo pipefail
export REPLACE_CONFIG_FROM_PACKAGE=1
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/full-update-on-server.sh"
exec bash "$SCRIPT"
