#!/usr/bin/env bash
# Create a Debian 12 LXC on a Proxmox host and install Lecturn into it.
# Run this ON THE PROXMOX HOST (as root).
#
#   # from a clone of this repo on the host:
#   MEDIA_HOST=/mnt/pool/courses CTID=120 bash deploy/lxc/create-lxc.sh
#
#   # or pull source from git instead of copying local files:
#   LECTURN_REPO=https://github.com/rajat10cube/lecturn MEDIA_HOST=/mnt/pool/courses CTID=120 \
#     bash deploy/lxc/create-lxc.sh
set -euo pipefail

CTID="${CTID:?Set CTID=<unused container id>, e.g. CTID=120}"
HOSTNAME="${HOSTNAME:-lecturn}"
CORES="${CORES:-2}"
RAM_MB="${RAM_MB:-1024}"
DISK_GB="${DISK_GB:-8}"
BRIDGE="${BRIDGE:-vmbr0}"
STORAGE="${STORAGE:-local-lvm}"           # rootfs storage
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
UNPRIVILEGED="${UNPRIVILEGED:-1}"          # 1=unprivileged (safer). See media note below.
MEDIA_HOST="${MEDIA_HOST:-}"               # host path to your courses (bind-mounted RO)
MEDIA_CT="${MEDIA_CT:-/libraries/courses}"
LECTURN_REPO="${LECTURN_REPO:-}"           # if empty, the local repo is copied in
LECTURN_AUTH_PASS="${LECTURN_AUTH_PASS:-change-me}"

msg() { echo -e "\e[1;34m[lecturn]\e[0m $*"; }
die() { echo -e "\e[1;31m[lecturn] $*\e[0m" >&2; exit 1; }
command -v pct >/dev/null || die "pct not found — run this on the Proxmox host."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- ensure a debian-12 template is available ---
msg "Locating Debian 12 template…"
TPL=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '{print $1}' | grep -m1 'debian-12-standard' || true)
if [ -z "$TPL" ]; then
  AVAIL=$(pveam available --section system | awk '{print $2}' | grep -m1 'debian-12-standard') \
    || die "no debian-12-standard template available via pveam"
  msg "Downloading $AVAIL…"
  pveam download "$TEMPLATE_STORAGE" "$AVAIL"
  TPL="$TEMPLATE_STORAGE:vztmpl/$AVAIL"
fi
msg "Template: $TPL"

# --- create + start container ---
msg "Creating CT $CTID ($HOSTNAME: ${CORES}c/${RAM_MB}MB/${DISK_GB}GB)…"
pct create "$CTID" "$TPL" \
  -hostname "$HOSTNAME" \
  -cores "$CORES" -memory "$RAM_MB" -swap 512 \
  -rootfs "$STORAGE:${DISK_GB}" \
  -net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  -features nesting=1 \
  -unprivileged "$UNPRIVILEGED" \
  -onboot 1

if [ -n "$MEDIA_HOST" ]; then
  msg "Bind-mounting $MEDIA_HOST -> $MEDIA_CT (read-only)…"
  pct set "$CTID" -mp0 "$MEDIA_HOST,mp=$MEDIA_CT,ro=1"
fi

pct start "$CTID"
msg "Waiting for network…"
for _ in $(seq 1 30); do pct exec "$CTID" -- test -e /etc/resolv.conf && break; sleep 1; done
pct exec "$CTID" -- bash -c 'for i in $(seq 1 30); do getent hosts deb.debian.org >/dev/null && break; sleep 1; done'

# --- deliver source ---
pct exec "$CTID" -- mkdir -p /opt/lecturn
if [ -z "$LECTURN_REPO" ]; then
  msg "Copying local source into the container…"
  TARBALL="/tmp/lecturn-src-$CTID.tar.gz"
  tar -czf "$TARBALL" -C "$REPO_ROOT" \
    --exclude='.git' --exclude='node_modules' --exclude='.venv' \
    --exclude='**/data' --exclude='backend/.env' --exclude='backend/data' .
  pct push "$CTID" "$TARBALL" /tmp/lecturn-src.tar.gz
  pct exec "$CTID" -- tar -xzf /tmp/lecturn-src.tar.gz -C /opt/lecturn
  rm -f "$TARBALL"
fi

# --- run installer inside the container ---
pct push "$CTID" "$SCRIPT_DIR/lecturn-install.sh" /root/lecturn-install.sh -perms 755
msg "Running installer…"
pct exec "$CTID" -- env \
  LECTURN_REPO="$LECTURN_REPO" \
  MEDIA_CT="$MEDIA_CT" \
  LECTURN_AUTH_PASS="$LECTURN_AUTH_PASS" \
  bash /root/lecturn-install.sh

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
msg "All set ✔  Lecturn → http://${IP:-<ct-ip>}:8000   (admin / $LECTURN_AUTH_PASS)"
[ "$UNPRIVILEGED" = "1" ] && [ -n "$MEDIA_HOST" ] && \
  msg "NOTE (unprivileged): if courses don't appear, the files must be readable by the" && \
  msg "      mapped UID. Either 'chmod -R o+rX $MEDIA_HOST' on the host, or recreate with UNPRIVILEGED=0."
