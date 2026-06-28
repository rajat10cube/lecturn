#!/usr/bin/env bash
# Lecturn — Proxmox VE LXC installer (community-scripts style, interactive).
#
# Run on the Proxmox host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/rajat10cube/lecturn/main/ct/lecturn.sh)"
#
# Pick Default (presets + random password) or Advanced (set CT id, resources,
# storage, etc.). Every value can also be preset via env (CTID, CT_HOSTNAME,
# CORES, RAM_MB, DISK_GB, STORAGE, BRIDGE, UNPRIVILEGED, MEDIA_HOST,
# LECTURN_AUTH_PASS) to run non-interactively.
set -euo pipefail

REPO="https://github.com/rajat10cube/lecturn"
RAW="https://raw.githubusercontent.com/rajat10cube/lecturn/main"

YW="\e[33m"; GN="\e[1;92m"; RD="\e[31m"; BL="\e[36m"; CL="\e[0m"
msg() { echo -e "${YW}[lecturn]${CL} $*"; }
ok()  { echo -e "${GN}[lecturn]${CL} $*"; }
die() { echo -e "${RD}[lecturn] $*${CL}" >&2; exit 1; }

header() {
  echo -e "${BL}"
  cat <<'EOF'
  _      ___ ___ _____ _   _ ___ _  _
 | |    | __/ __|_   _| | | | _ \ \| |
 | |__  | _| (__  | | | |_| |   / .` |
 |____| |___\___| |_|  \___/|_|_\_|\_|
        self-hosted course player
EOF
  echo -e "${CL}"
}

command -v pct >/dev/null || die "Run this on a Proxmox VE host (pct not found)."
[ "$(id -u)" -eq 0 ] || die "Run as root."

gen_pass() {
  { openssl rand -base64 24 2>/dev/null || head -c 32 /dev/urandom | base64; } \
    | tr -dc 'A-Za-z0-9' | head -c 16
}

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
LECTURN_AUTH_PASS="${LECTURN_AUTH_PASS:-$(gen_pass)}"
STORAGE="${STORAGE:-$(pick_storage rootdir)}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-$(pick_storage vztmpl)}"
CTID="${CTID:-$(pvesh get /cluster/nextid 2>/dev/null || true)}"
[ -n "${TEMPLATE_STORAGE:-}" ] || TEMPLATE_STORAGE="local"
[ -n "${STORAGE:-}" ] || die "no storage supporting container rootfs found (set STORAGE=)."
[ -n "${CTID:-}" ] || die "could not determine a CT ID (set CTID=)."

header

# --- Default / Advanced (whiptail when we have a TTY) ---
if [ -t 0 ] && command -v whiptail >/dev/null; then
  MODE=$(whiptail --title "Lecturn LXC" --menu \
"How do you want to install Lecturn?" 13 64 2 \
    "default"  "Presets + random password (quick)" \
    "advanced" "Set CT id, resources, storage, password…" \
    3>&1 1>&2 2>&3) || die "cancelled"

  if [ "$MODE" = "advanced" ]; then
    CTID=$(whiptail --title "Advanced" --inputbox "Container ID" 8 60 "$CTID" 3>&1 1>&2 2>&3) || die "cancelled"
    CT_HOSTNAME=$(whiptail --title "Advanced" --inputbox "Hostname" 8 60 "$CT_HOSTNAME" 3>&1 1>&2 2>&3) || die "cancelled"
    CORES=$(whiptail --title "Advanced" --inputbox "CPU cores" 8 60 "$CORES" 3>&1 1>&2 2>&3) || die "cancelled"
    RAM_MB=$(whiptail --title "Advanced" --inputbox "RAM (MB)" 8 60 "$RAM_MB" 3>&1 1>&2 2>&3) || die "cancelled"
    DISK_GB=$(whiptail --title "Advanced" --inputbox "Disk (GB)" 8 60 "$DISK_GB" 3>&1 1>&2 2>&3) || die "cancelled"
    STORAGE=$(whiptail --title "Advanced" --inputbox "Storage (rootfs)" 8 60 "$STORAGE" 3>&1 1>&2 2>&3) || die "cancelled"
    BRIDGE=$(whiptail --title "Advanced" --inputbox "Network bridge" 8 60 "$BRIDGE" 3>&1 1>&2 2>&3) || die "cancelled"
    if whiptail --title "Privilege" --yesno "Unprivileged container? (recommended)\n\nChoose <No> only if your course files are not world-readable." 12 64; then
      UNPRIVILEGED=1; else UNPRIVILEGED=0; fi
    LECTURN_AUTH_PASS=$(whiptail --title "Password" --passwordbox \
"Admin password (login user: admin)" 8 60 "$LECTURN_AUTH_PASS" 3>&1 1>&2 2>&3) || die "cancelled"
  fi
  whiptail --title "Confirm" --yesno \
"Create CT $CTID ($CT_HOSTNAME)?\n
  Cores: $CORES   RAM: ${RAM_MB}MB   Disk: ${DISK_GB}GB
  Storage: $STORAGE   Bridge: $BRIDGE
  Unprivileged: $([ "$UNPRIVILEGED" = 1 ] && echo yes || echo no)

You'll add your course folders afterwards in the web UI." 16 64 || die "cancelled"
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
  LECTURN_REPO="$REPO" LECTURN_AUTH_PASS="$LECTURN_AUTH_PASS" \
  bash /root/lecturn-install.sh

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
echo
ok "Done!  Lecturn → http://${IP:-<ct-ip>}:8000"
ok "Login:  admin / $LECTURN_AUTH_PASS"
echo
msg "Add your courses in the web UI → Libraries. First make them visible to the CT, e.g.:"
msg "  pct set $CTID -mp0 /your/host/courses,mp=/mnt/courses,ro=1 && pct reboot $CTID"
msg "then add the path /mnt/courses in the UI."
[ "$UNPRIVILEGED" = "1" ] && msg "(unprivileged: if the folder isn't readable inside the CT, run 'chmod -R o+rX' on it on the host.)"
