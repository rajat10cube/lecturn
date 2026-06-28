#!/usr/bin/env bash
# Create a Debian 12 LXC on a Proxmox host and install Lecturn into it.
# Run this ON THE PROXMOX HOST (as root).
#
# One-liner (fetches everything from GitHub):
#   MEDIA_HOST=/mnt/pool/courses CTID=120 \
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/rajat10cube/lecturn/main/deploy/lxc/create-lxc.sh)"
#
# From a local clone instead (copy local source into the CT):
#   MEDIA_HOST=/mnt/pool/courses CTID=120 LECTURN_REPO= bash deploy/lxc/create-lxc.sh
set -euo pipefail

CTID="${CTID:?Set CTID=<unused container id>, e.g. CTID=120}"
CT_HOSTNAME="${CT_HOSTNAME:-lecturn}"   # note: not HOSTNAME (shell builtin = the PVE host's name)
CORES="${CORES:-2}"
RAM_MB="${RAM_MB:-1024}"
DISK_GB="${DISK_GB:-8}"
BRIDGE="${BRIDGE:-vmbr0}"
STORAGE="${STORAGE:-local-lvm}"            # rootfs storage
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
UNPRIVILEGED="${UNPRIVILEGED:-1}"          # 1=unprivileged (safer). See media note.
MEDIA_HOST="${MEDIA_HOST:-}"               # host path to your courses (bind-mounted RO)
MEDIA_CT="${MEDIA_CT:-/libraries/courses}"
LECTURN_AUTH_PASS="${LECTURN_AUTH_PASS:-change-me}"

# Where to get Lecturn from. Default = clone the public repo (works for curl|bash).
# Set LECTURN_REPO= (empty) when running from a local clone to copy local source.
LECTURN_REPO="${LECTURN_REPO-https://github.com/rajat10cube/lecturn}"
LECTURN_RAW="${LECTURN_RAW:-https://raw.githubusercontent.com/rajat10cube/lecturn/main}"

msg() { echo -e "\e[1;34m[lecturn]\e[0m $*"; }
die() { echo -e "\e[1;31m[lecturn] $*\e[0m" >&2; exit 1; }
command -v pct >/dev/null || die "pct not found — run this on the Proxmox host."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

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
msg "Creating CT $CTID ($CT_HOSTNAME: ${CORES}c/${RAM_MB}MB/${DISK_GB}GB)…"
pct create "$CTID" "$TPL" \
  -hostname "$CT_HOSTNAME" \
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

# --- deliver source (only when NOT cloning from git) ---
pct exec "$CTID" -- mkdir -p /opt/lecturn
if [ -z "$LECTURN_REPO" ]; then
  [ -n "$SCRIPT_DIR" ] || die "local-source mode needs to run from a clone (set LECTURN_REPO=URL instead)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  msg "Copying local source ($REPO_ROOT) into the container…"
  TARBALL="/tmp/lecturn-src-$CTID.tar.gz"
  tar -czf "$TARBALL" -C "$REPO_ROOT" \
    --exclude='.git' --exclude='node_modules' --exclude='.venv' \
    --exclude='**/data' --exclude='backend/.env' --exclude='backend/data' .
  pct push "$CTID" "$TARBALL" /tmp/lecturn-src.tar.gz
  pct exec "$CTID" -- tar -xzf /tmp/lecturn-src.tar.gz -C /opt/lecturn
  rm -f "$TARBALL"
fi

# --- get the in-container installer (local file or fetch from GitHub raw) ---
INSTALLER="$SCRIPT_DIR/lecturn-install.sh"
if [ ! -f "$INSTALLER" ]; then
  INSTALLER="/tmp/lecturn-install.sh"
  msg "Fetching installer from $LECTURN_RAW…"
  curl -fsSL "$LECTURN_RAW/deploy/lxc/lecturn-install.sh" -o "$INSTALLER" \
    || die "could not download lecturn-install.sh"
fi
pct push "$CTID" "$INSTALLER" /root/lecturn-install.sh -perms 755

# --- run installer inside the container ---
msg "Running installer…"
pct exec "$CTID" -- env \
  LECTURN_REPO="$LECTURN_REPO" \
  MEDIA_CT="$MEDIA_CT" \
  LECTURN_AUTH_PASS="$LECTURN_AUTH_PASS" \
  bash /root/lecturn-install.sh

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
msg "All set ✔  Lecturn → http://${IP:-<ct-ip>}:8000   (admin / $LECTURN_AUTH_PASS)"
[ "$UNPRIVILEGED" = "1" ] && [ -n "$MEDIA_HOST" ] && {
  msg "NOTE (unprivileged): if courses don't appear, files must be readable by the"
  msg "      mapped UID — 'chmod -R o+rX $MEDIA_HOST' on the host, or recreate with UNPRIVILEGED=0."
} || true
