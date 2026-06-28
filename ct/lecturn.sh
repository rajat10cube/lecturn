#!/usr/bin/env bash
# Lecturn — Proxmox VE LXC installer (community-scripts style, interactive).
#
# Run on the Proxmox host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/rajat10cube/lecturn/main/ct/lecturn.sh)"
#
# No arguments needed — it auto-picks the next CT ID and prompts for settings.
# Every value can also be preset via env (CTID, CT_HOSTNAME, CORES, RAM_MB,
# DISK_GB, STORAGE, BRIDGE, UNPRIVILEGED, MEDIA_HOST, LECTURN_AUTH_PASS).
set -euo pipefail

REPO="https://github.com/rajat10cube/lecturn"
RAW="https://raw.githubusercontent.com/rajat10cube/lecturn/main"

YW="\e[33m"; GN="\e[1;92m"; RD="\e[31m"; CL="\e[0m"
msg() { echo -e "${YW}[lecturn]${CL} $*"; }
ok()  { echo -e "${GN}[lecturn]${CL} $*"; }
die() { echo -e "${RD}[lecturn] $*${CL}" >&2; exit 1; }

command -v pct >/dev/null || die "Run this on a Proxmox VE host (pct not found)."
[ "$(id -u)" -eq 0 ] || die "Run as root."

pick_storage() { # $1 = content type (rootdir | vztmpl)
  local list
  list=$(pvesm status --content "$1" 2>/dev/null | awk 'NR>1 {print $1}')
  echo "$list" | grep -qx "local-lvm" && { echo "local-lvm"; return; }
  echo "$list" | head -1
}

# --- defaults (all env-overridable) ---
CT_HOSTNAME="${CT_HOSTNAME:-lecturn}"
CORES="${CORES:-2}"
RAM_MB="${RAM_MB:-2048}"
DISK_GB="${DISK_GB:-10}"
BRIDGE="${BRIDGE:-vmbr0}"
UNPRIVILEGED="${UNPRIVILEGED:-1}"
MEDIA_CT="${MEDIA_CT:-/libraries/courses}"
MEDIA_HOST="${MEDIA_HOST:-}"
LECTURN_AUTH_PASS="${LECTURN_AUTH_PASS:-change-me}"
STORAGE="${STORAGE:-$(pick_storage rootdir)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-$(pick_storage vztmpl)}"
CTID="${CTID:-$(pvesh get /cluster/nextid 2>/dev/null || true)}"
[ -n "${TEMPLATE_STORAGE:-}" ] || TEMPLATE_STORAGE="local"
[ -n "${STORAGE:-}" ] || die "no storage supporting container rootfs found (set STORAGE=)."
[ -n "${CTID:-}" ] || die "could not determine a CT ID (set CTID=)."

# --- interactive prompts (whiptail) when we have a TTY ---
if [ -t 0 ] && command -v whiptail >/dev/null; then
  if ! whiptail --title "Lecturn LXC" --yesno \
"Create a Lecturn container with these defaults?\n
  CT ID:        $CTID
  Hostname:     $CT_HOSTNAME
  Cores:        $CORES
  RAM:          ${RAM_MB} MB
  Disk:         ${DISK_GB} GB
  Storage:      $STORAGE
  Bridge:       $BRIDGE
  Unprivileged: $([ "$UNPRIVILEGED" = 1 ] && echo yes || echo no)
\nChoose <No> to edit these (Advanced)." 22 66; then
    CTID=$(whiptail --title "Advanced" --inputbox "Container ID" 8 60 "$CTID" 3>&1 1>&2 2>&3) || die "cancelled"
    CT_HOSTNAME=$(whiptail --title "Advanced" --inputbox "Hostname" 8 60 "$CT_HOSTNAME" 3>&1 1>&2 2>&3) || die "cancelled"
    CORES=$(whiptail --title "Advanced" --inputbox "CPU cores" 8 60 "$CORES" 3>&1 1>&2 2>&3) || die "cancelled"
    RAM_MB=$(whiptail --title "Advanced" --inputbox "RAM (MB)" 8 60 "$RAM_MB" 3>&1 1>&2 2>&3) || die "cancelled"
    DISK_GB=$(whiptail --title "Advanced" --inputbox "Disk (GB)" 8 60 "$DISK_GB" 3>&1 1>&2 2>&3) || die "cancelled"
    STORAGE=$(whiptail --title "Advanced" --inputbox "Storage (rootfs)" 8 60 "$STORAGE" 3>&1 1>&2 2>&3) || die "cancelled"
    BRIDGE=$(whiptail --title "Advanced" --inputbox "Network bridge" 8 60 "$BRIDGE" 3>&1 1>&2 2>&3) || die "cancelled"
    if whiptail --title "Privilege" --yesno "Unprivileged container? (recommended)\n\nChoose <No> only if your course files are not world-readable." 12 64; then
      UNPRIVILEGED=1; else UNPRIVILEGED=0; fi
  fi
  MEDIA_HOST=$(whiptail --title "Courses" --inputbox \
"Path ON THIS PROXMOX HOST to your downloaded courses.
It will be bind-mounted read-only at $MEDIA_CT.

Leave blank to skip and add it later." 12 72 "$MEDIA_HOST" 3>&1 1>&2 2>&3) || MEDIA_HOST=""
  LECTURN_AUTH_PASS=$(whiptail --title "Password" --passwordbox \
"Admin password for Lecturn (login user: admin)" 8 60 "$LECTURN_AUTH_PASS" 3>&1 1>&2 2>&3) || LECTURN_AUTH_PASS="change-me"
else
  msg "Non-interactive — using defaults/env (CTID=$CTID, storage=$STORAGE)."
fi

# --- ensure a Debian 12 template ---
msg "Locating Debian 12 template…"
TPL=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '{print $1}' | grep -m1 'debian-12-standard' || true)
if [ -z "$TPL" ]; then
  AVAIL=$(pveam available --section system | awk '{print $2}' | grep -m1 'debian-12-standard') \
    || die "no debian-12-standard template available via pveam."
  msg "Downloading $AVAIL…"
  pveam download "$TEMPLATE_STORAGE" "$AVAIL" >/dev/null
  TPL="$TEMPLATE_STORAGE:vztmpl/$AVAIL"
fi

# --- create + start ---
msg "Creating CT $CTID ($CT_HOSTNAME)…"
pct create "$CTID" "$TPL" \
  -hostname "$CT_HOSTNAME" -cores "$CORES" -memory "$RAM_MB" -swap 512 \
  -rootfs "$STORAGE:${DISK_GB}" -net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  -features nesting=1 -unprivileged "$UNPRIVILEGED" -onboot 1 >/dev/null

if [ -n "$MEDIA_HOST" ]; then
  msg "Bind-mounting $MEDIA_HOST → $MEDIA_CT (read-only)…"
  pct set "$CTID" -mp0 "$MEDIA_HOST,mp=$MEDIA_CT,ro=1"
fi

msg "Starting container…"
pct start "$CTID"
for _ in $(seq 1 30); do pct exec "$CTID" -- test -e /etc/resolv.conf 2>/dev/null && break; sleep 1; done
pct exec "$CTID" -- bash -c 'for i in $(seq 1 30); do getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 1; done'

# --- fetch installer on the host, push it in, run it ---
msg "Fetching installer…"
curl -fsSL "$RAW/deploy/lxc/lecturn-install.sh" -o /tmp/lecturn-install.sh || die "could not download installer"
pct push "$CTID" /tmp/lecturn-install.sh /root/lecturn-install.sh -perms 755
rm -f /tmp/lecturn-install.sh

msg "Installing Lecturn (clones repo + builds frontend; a few minutes)…"
pct exec "$CTID" -- env \
  LECTURN_REPO="$REPO" MEDIA_CT="$MEDIA_CT" LECTURN_AUTH_PASS="$LECTURN_AUTH_PASS" \
  bash /root/lecturn-install.sh

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
ok "Done!  Lecturn → http://${IP:-<ct-ip>}:8000   (login: admin / $LECTURN_AUTH_PASS)"
if [ "$UNPRIVILEGED" = "1" ] && [ -n "$MEDIA_HOST" ]; then
  msg "If courses don't appear: 'chmod -R o+rX $MEDIA_HOST' on the host (unprivileged"
  msg "containers need the files readable by the mapped UID), then: pct exec $CTID -- systemctl restart lecturn"
fi
