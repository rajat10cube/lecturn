# Lecturn on Proxmox (LXC)

A native LXC install (no Docker) with a `systemd` service — the same convenient
shape as the [community-scripts.org](https://community-scripts.org/) helpers, but
runnable on *your* host today.

> **About community-scripts.org:** that's a curated GitHub project
> (`community-scripts/ProxmoxVE`). Getting Lecturn *listed* there means opening a
> PR that follows their framework + criteria, and Lecturn must be public on
> GitHub. These scripts give you the same one-command experience without waiting
> on that. (Happy to prep a submission later — see "Publishing" below.)

## Quick start (on the Proxmox host, as root)

**One-liner** — fetches everything from GitHub, creates the LXC, installs Lecturn:
```bash
MEDIA_HOST=/mnt/pool/courses CTID=120 LECTURN_AUTH_PASS='supersecret' \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/rajat10cube/lecturn/main/deploy/lxc/create-lxc.sh)"
```

Or from a local clone (copies your local source instead of cloning the repo):
```bash
git clone https://github.com/rajat10cube/lecturn && cd lecturn
MEDIA_HOST=/mnt/pool/courses CTID=120 LECTURN_REPO= bash deploy/lxc/create-lxc.sh
```

That creates a Debian 12 LXC, mounts your courses read-only at
`/libraries/courses`, builds + installs Lecturn, and starts it on
`http://<container-ip>:8000`.

### Knobs (env vars for `create-lxc.sh`)
| Var | Default | Meaning |
|-----|---------|---------|
| `CTID` | *(required)* | unused container id, e.g. `120` |
| `MEDIA_HOST` | – | host path to your courses (bind-mounted RO) |
| `MEDIA_CT` | `/libraries/courses` | mount point inside the CT (matches `lecturn.yaml`) |
| `HOSTNAME` | `lecturn` | container hostname |
| `CORES` / `RAM_MB` / `DISK_GB` | `2` / `1024` / `8` | resources |
| `BRIDGE` / `STORAGE` | `vmbr0` / `local-lvm` | network / rootfs storage |
| `UNPRIVILEGED` | `1` | `0` = privileged (simplest for media perms) |
| `LECTURN_REPO` | – | clone from git instead of copying local source |
| `LECTURN_AUTH_PASS` | `change-me` | Basic-auth password |

## Media access & permissions (important)
The container reads your courses via a **read-only bind mount** (`pct set -mp0`).
In an **unprivileged** container (the default), host files must be readable by the
mapped UID. If courses don't show up:
- on the host: `chmod -R o+rX /mnt/pool/courses`, **or**
- recreate with `UNPRIVILEGED=0` (privileged container).

Multiple libraries? Add more mounts and list them in `lecturn.yaml`:
```bash
pct set 120 -mp1 /mnt/pool/udemy,mp=/libraries/udemy,ro=1
```
```yaml
# /opt/lecturn/lecturn.yaml  (inside the CT)
libraries:
  - path: /libraries/courses
  - path: /libraries/udemy
```
then `pct exec 120 -- systemctl restart lecturn`.

## Day-2

```bash
pct exec 120 -- systemctl status lecturn
pct exec 120 -- journalctl -u lecturn -f          # logs
# rescan after adding courses:
curl -u admin:PASS -X POST http://<ip>:8000/api/admin/rescan
```

Put it behind your reverse proxy as usual — see [../../docs/DEPLOY.md](../../docs/DEPLOY.md).

## Updating
```bash
# if installed from git:
pct exec 120 -- bash -c 'cd /opt/lecturn && git pull && \
  LECTURN_REPO= bash /root/lecturn-install.sh && systemctl restart lecturn'
```

## Manual install (existing container)
Already have a Debian/Ubuntu LXC? Just run the in-container installer:
```bash
LECTURN_REPO=https://github.com/rajat10cube/lecturn bash lecturn-install.sh
```

## Publishing to community-scripts.org (optional, later)
To submit Lecturn as an official helper script you'd: (1) make the repo public on
GitHub, (2) fork `community-scripts/ProxmoxVE`, (3) add `ct/lecturn.sh` +
`install/lecturn-install.sh` using their `build.func` framework and an app
metadata entry, (4) open a PR and pass their review. The logic here maps directly
onto that framework; ask and I'll adapt these into the PR layout.
