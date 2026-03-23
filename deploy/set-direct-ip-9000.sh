#!/bin/bash
# Однократно на сервере: слушать :9000 снаружи + URL медиа по IP.
# Запуск: sudo bash set-direct-ip-9000.sh
# После: sudo ufw allow 9000/tcp && sudo ufw reload
#        sudo systemctl restart dierchat

set -euo pipefail
CFG="/opt/dierchat/config.json"
if [ ! -f "$CFG" ]; then
  echo "Нет $CFG"
  exit 1
fi
python3 <<'PY'
import json, sys
path = "/opt/dierchat/config.json"
with open(path, encoding="utf-8") as f:
    c = json.load(f)
c.setdefault("server", {})["host"] = "0.0.0.0"
c.setdefault("server", {})["port"] = 9000
c.setdefault("media", {})["cdn_base_url"] = "http://31.148.99.40:9000/media"
with open(path, "w", encoding="utf-8") as f:
    json.dump(c, f, indent=4, ensure_ascii=False)
    f.write("\n")
print("OK:", path)
PY
echo "Откройте файрвол: ufw allow 9000/tcp && ufw reload"
echo "Перезапуск: systemctl restart dierchat"
