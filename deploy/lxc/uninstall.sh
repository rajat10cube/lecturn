#!/usr/bin/env bash
# Remove Lecturn (run INSIDE the container, or via `pct exec`).
# Keeps your data by default; pass --purge to also delete it.
#
#   bash uninstall.sh            # remove app, keep /opt/lecturn-data
#   bash uninstall.sh --purge    # also delete data + service user
set -euo pipefail

systemctl disable --now lecturn 2>/dev/null || true
rm -f /etc/systemd/system/lecturn.service
systemctl daemon-reload 2>/dev/null || true
rm -rf /opt/lecturn

if [ "${1:-}" = "--purge" ]; then
  rm -rf /opt/lecturn-data
  id lecturn >/dev/null 2>&1 && deluser lecturn 2>/dev/null || true
  echo "[lecturn] fully removed (including data)."
else
  echo "[lecturn] removed. Data kept at /opt/lecturn-data (re-run with --purge to delete)."
fi
echo "[lecturn] To remove the whole container, on the host run: pct stop <CTID> && pct destroy <CTID>"
