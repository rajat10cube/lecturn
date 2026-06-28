#!/usr/bin/env bash
# Update Lecturn in place (run INSIDE the container, or via `pct exec`).
# Re-fetches the app + rebuilds; your data, library config and password
# (in /opt/lecturn-data) are preserved.
set -euo pipefail
export LANG=C.UTF-8 LC_ALL=C.UTF-8

RAW="https://raw.githubusercontent.com/rajat10cube/lecturn/main"
REPO="https://github.com/rajat10cube/lecturn"

curl -fsSL "$RAW/deploy/lxc/lecturn-install.sh" -o /tmp/lecturn-install.sh
LECTURN_REPO="$REPO" bash /tmp/lecturn-install.sh
rm -f /tmp/lecturn-install.sh
echo "[lecturn] update complete."
