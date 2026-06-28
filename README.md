# Lecturn

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

A self-hosted **"Udemy for your own downloads"** course player. Point it at a
folder of downloaded courses and get a browsable library, sequential lecture
playback, search, and resume-where-you-left-off — from any browser on your home
server.

> Built for the homelab/Proxmox use case: it *consumes* courses you already have
> organized in folders. It is **not** an authoring LMS — no re-uploading or
> rebuilding content.

## Features
- **Scanner** — folder → Course / Section / Lecture with **auto group-depth
  detection** (adapts to flat *or* provider-grouped layouts), natural sort, title
  cleanup, subtitle + cover detection, project-bundle/junk exclusion, and a
  rescan endpoint.
- **Streaming** — HTTP-range (path-traversal-guarded) `.mp4` direct play, `.ts`
  via `mpegts.js`, on-the-fly `.mkv` remux (`ffmpeg -c copy`), SRT→WebVTT
  subtitles.
- **Accounts** — in-app login page (cookie session) with **multiple users**:
  admins manage users + libraries; each user gets their **own progress**. Hashed
  passwords (PBKDF2), self-serve password change. Basic auth also works for API/CLI.
- **Libraries** — add/remove course folders from the web UI (like Jellyfin),
  with a built-in folder browser; auto-scans on add.
- **Library UI** — searchable grid (SQLite FTS5) across courses *and* lessons
  with a provider filter; course player with resume + autoplay-next; in-app
  PDF/HTML viewing.
- **Progress** — per-lecture position + completion (sticky at 90%), per-course
  percentage, and a "Continue learning" row.
- **Deploy** — multi-stage Docker (ffmpeg bundled) + healthcheck, SPA deep-link
  fallback, reverse-proxy / subpath support, and Proxmox LXC install scripts.

Possible future work: ffmpeg cover thumbnails + durations; multi-user/SSO; HEVC
transcode fallback; notes/bookmarks; PWA.

## Stack
Python 3.12 · FastAPI · SQLite (→ Postgres later) · React + TypeScript · Docker.
Playback follows Jellyfin's tiering via ffmpeg: direct-play `.mp4`, `mpegts.js`
for `.ts`, `ffmpeg -c copy` remux for `.mkv`, transcode only as a rare fallback.

## Repo layout
```
backend/    FastAPI app, SQLAlchemy models, Alembic, scanner, tests
frontend/   React + TS SPA (Vite) — builds into backend/app/static
deploy/     Proxmox LXC install scripts
docs/       deployment guide
Dockerfile, docker-compose.yml, lecturn.yaml.example
```

## Dev quickstart

**Backend** (from `backend/`):
```bash
python -m venv .venv
. .venv/Scripts/activate        # Windows;  use .venv/bin/activate on Linux/macOS
pip install -r requirements-dev.txt
cp .env.example .env            # set LECTURN_COURSES_DIR or LECTURN_CONFIG
uvicorn app.main:app --reload   # http://localhost:8000  (docs at /docs)
pytest                          # smoke tests
```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev                     # http://localhost:5173 (proxies /api -> :8000)
```

**Generate the first DB migration** (after models settle):
```bash
cd backend && alembic revision --autogenerate -m "baseline" && alembic upgrade head
```

## Deploy

**Docker:**
```bash
cp lecturn.yaml.example lecturn.yaml     # edit library paths (group_depth: auto)
# edit docker-compose.yml volume paths + LECTURN_AUTH_PASS
docker compose up --build                # http://<host>:8800
```

**Proxmox LXC (no Docker)** — run on the PVE host; it's interactive
(Default/Advanced, auto-picks the CT ID) and installs Lecturn as a `systemd`
service. You add your course folders afterwards in the app:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/rajat10cube/lecturn/main/ct/lecturn.sh)"
```
See **[deploy/lxc/README.md](deploy/lxc/README.md)**. Reverse proxy:
**[docs/DEPLOY.md](docs/DEPLOY.md)**. Mount course libraries read-only; app state
lives in a data volume. Put it behind your existing reverse proxy / VPN.

## Accounts
Lecturn shows its own **login page** (cookie session). On first run an **admin**
is created from `LECTURN_AUTH_USER` / `LECTURN_AUTH_PASS` (default `admin` /
`change-me` — **change it before exposing**). Admins add more users in
**Settings → Users**; each user has their own watch progress. Passwords are
hashed (PBKDF2) and users can change their own in **Settings → Account**.
API/CLI clients may use HTTP Basic (e.g. `curl -u`). Set `LECTURN_AUTH=none` to
disable auth entirely (single-user, LAN/VPN only).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, conventions, and PR guidelines.

## License
Licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).
AGPL covers network use: if you run a modified Lecturn as a network service, you
must offer its users the corresponding modified source.
