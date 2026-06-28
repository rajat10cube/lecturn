# Deploying Lecturn (Proxmox / homelab)

Lecturn ships as one Docker image: the React SPA is built and served by the
FastAPI app, which also streams media and runs ffmpeg for `.mkv` remux.

## 1. docker compose

```bash
cp lecturn.yaml.example lecturn.yaml      # set library paths (group_depth: auto)
# edit docker-compose.yml volume paths + LECTURN_AUTH_PASS
docker compose up --build                 # http://<host>:8800
```

- Mount your course libraries **read-only** (`:ro`).
- App state (SQLite + caches) lives in the named volume `lecturn-data`.
- Defaults to HTTP Basic auth `admin` / `change-me` — **change `LECTURN_AUTH_PASS`.**
- The container has a `HEALTHCHECK` hitting `/api/health`.

Trigger a rescan after adding courses:
```bash
curl -u admin:PASS -X POST http://<host>:8800/api/admin/rescan
```

## 2. Behind your reverse proxy

The app serves everything from the **root** path and uses absolute URLs for its
assets/API. The simplest, most robust setup is **host-based** (a subdomain), or a
subpath proxy that **strips the prefix** before forwarding.

### Caddy (recommended)
```caddy
courses.example.com {
    reverse_proxy 127.0.0.1:8800
}
```

### Nginx Proxy Manager
- New Proxy Host → Forward to `lecturn:8000` (or `host:8800`).
- Enable **WebSockets**? not required. Enable **Block Common Exploits** is fine.
- Increase proxy read timeout (streaming): set `proxy_read_timeout 3600;` in the
  Advanced tab (long videos / remux).

### Traefik (labels on the compose service)
```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.lecturn.rule=Host(`courses.example.com`)
  - traefik.http.services.lecturn.loadbalancer.server.port=8000
```

### Subpath (e.g. https://home.example.com/courses)
Strip the prefix at the proxy, and tell the app its public base for correct
`/docs` + OpenAPI links:
```caddy
home.example.com {
    handle_path /courses/* {
        reverse_proxy 127.0.0.1:8800
    }
}
```
```yaml
# docker-compose.yml -> environment
LECTURN_BASE_PATH: /courses     # used as FastAPI root_path
```
> If your proxy does **not** strip the prefix, host Lecturn on its own
> subdomain instead — the SPA's absolute asset paths assume root.

## 3. Notes

- **Streaming timeouts:** make sure the proxy allows long-lived responses
  (videos + remux are long streams). Caddy/Traefik are fine by default; for
  nginx set `proxy_read_timeout` / `proxy_buffering off`.
- **HTTP Range:** Lecturn returns `206 Partial Content`; don't let the proxy
  strip `Range`/`Accept-Ranges` (defaults are fine).
- **ffmpeg:** bundled in the image, so `.mkv` remux works out of the box.
- **SSO (future):** front it with Authelia/Authentik forward-auth; Lecturn's
  `require_auth` seam can later trust a forwarded user header for per-user
  progress (Phase 6).
- **VPN-only:** set `LECTURN_AUTH=none` and rely on Tailscale/WireGuard/LAN.
