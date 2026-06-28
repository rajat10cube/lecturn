#!/usr/bin/env bash
# Lecturn in-container installer.
# Run INSIDE a Debian 12 LXC (as root). Installs Lecturn as a systemd service.
#
#   LECTURN_REPO=https://github.com/rajat10cube/lecturn LECTURN_REF=main bash lecturn-install.sh
#   # or, with source already unpacked at /opt/lecturn:
#   bash lecturn-install.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lecturn}"
DATA_DIR="${DATA_DIR:-/opt/lecturn-data}"
SERVICE_USER="${SERVICE_USER:-lecturn}"
PORT="${PORT:-8000}"
NODE_MAJOR="${NODE_MAJOR:-22}"
LECTURN_REPO="${LECTURN_REPO:-}"
LECTURN_REF="${LECTURN_REF:-main}"
MEDIA_CT="${MEDIA_CT:-/libraries/courses}"
AUTH_USER="${LECTURN_AUTH_USER:-admin}"
AUTH_PASS="${LECTURN_AUTH_PASS:-change-me}"

msg() { echo -e "\e[1;34m[lecturn]\e[0m $*"; }
die() { echo -e "\e[1;31m[lecturn] $*\e[0m" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"

export DEBIAN_FRONTEND=noninteractive
msg "Installing base packages (python, ffmpeg, git)…"
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip ffmpeg git ca-certificates curl >/dev/null

# --- fetch source ---
if [ -n "$LECTURN_REPO" ]; then
  msg "Cloning $LECTURN_REPO ($LECTURN_REF)…"
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$LECTURN_REF" "$LECTURN_REPO" "$APP_DIR"
elif [ -d "$APP_DIR/backend" ]; then
  msg "Using existing source at $APP_DIR"
else
  die "no LECTURN_REPO set and no source found at $APP_DIR"
fi

# --- frontend: use prebuilt static if shipped, else build with Node ---
if [ -f "$APP_DIR/backend/app/static/index.html" ]; then
  msg "Prebuilt frontend found — skipping Node/build."
else
  msg "Installing Node.js ${NODE_MAJOR} and building frontend…"
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y nodejs >/dev/null
  fi
  ( cd "$APP_DIR/frontend" && (npm ci || npm install) && npm run build )
fi

# --- python venv + deps ---
msg "Creating Python venv and installing dependencies…"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --upgrade pip >/dev/null
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" >/dev/null

# --- service user + dirs ---
id -u "$SERVICE_USER" >/dev/null 2>&1 || \
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$DATA_DIR"

# --- config (only if absent, so re-runs don't clobber) ---
if [ ! -f "$APP_DIR/lecturn.yaml" ]; then
  msg "Writing default lecturn.yaml (libraries: $MEDIA_CT)…"
  cat > "$APP_DIR/lecturn.yaml" <<YAML
# group_depth defaults to "auto" — adapts to your folder layout.
libraries:
  - path: $MEDIA_CT
YAML
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR" "$DATA_DIR"

# --- systemd service ---
msg "Installing systemd service…"
cat > /etc/systemd/system/lecturn.service <<EOF
[Unit]
Description=Lecturn course player
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/backend
Environment=LECTURN_CONFIG=$APP_DIR/lecturn.yaml
Environment=LECTURN_DATA_DIR=$DATA_DIR
Environment=LECTURN_AUTH=basic
Environment=LECTURN_AUTH_USER=$AUTH_USER
Environment=LECTURN_AUTH_PASS=$AUTH_PASS
ExecStart=$APP_DIR/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips '*'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lecturn

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
msg "Done ✔  Lecturn → http://${IP:-<container-ip>}:$PORT"
msg "Login: $AUTH_USER / $AUTH_PASS  (change LECTURN_AUTH_PASS in the service file!)"
msg "Mount your courses at $MEDIA_CT, then: systemctl restart lecturn"
