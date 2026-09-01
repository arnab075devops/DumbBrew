#service #infra

# gateway

Parent: [[Home]] · See also: [[API Endpoint Map]], [[Rate Limits]], [[Frontend Pages]]

**Path:** `backend/gateway/` · **Port:** 80 (host) · **Tech:** nginx, static Docker image

## Responsibility

Two jobs in one container: (1) serves the static site (`public/`) and (2) reverse-proxies every `/api/*` path to the right upstream service by longest-prefix match, applying per-route rate-limit zones.

## File map

```
Dockerfile              Builds an nginx image with public/ COPYed in — see "no volume mount" warning below
nginx.conf               THE routing table — upstreams, rate-limit zones, location blocks. See [[API Endpoint Map]] / [[Rate Limits]] for the full breakdown.
proxy_params.conf        Shared proxy_pass headers (Host, X-Real-IP, X-Forwarded-*, etc.), included by every location block
public/                  THE LIVE SITE — see [[Frontend Pages]] and [[config.js Reference]]
```

## ⚠ Critical operational detail: no volume mount

`public/` is baked into the Docker image **at build time**. Editing any file under `public/` (including `config.js`) has **zero effect** on the running container until you rebuild:

```sh
docker compose up -d --build gateway
```

A plain file save + browser refresh will keep serving the old version. This bit the person setting up customer accounts (see [[Current Status]]) — every frontend edit during that work needed an explicit rebuild.

## Also watch for: browser HTTP cache

`config.js`/`account.html`/etc. have no `Cache-Control` header, so browsers apply heuristic caching and can keep serving a stale copy even after a successful gateway rebuild — cache-busting query params (`?_=<timestamp>`) were needed during verification. Not an issue for real users (they're not reloading mid-session while the server content changes under them), but worth knowing when testing changes.

## nginx behavior notes

- `location` blocks match by **longest prefix**, not declaration order. `nginx.conf` has two places where a more-specific block is placed to win over a shorter one it would otherwise sit "after": `/api/payments/webhook` before the general `/api/payments`, and `/api/sellers/applications` + `/api/sellers/auth/login` before the general `/api/sellers`.
- `location /` does `try_files $uri $uri/ /index.html` — any path that isn't a real static file or an `/api/*` route falls through to `index.html` (SPA-style fallback), even though this isn't really an SPA.
- Security headers set globally: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `GET /healthz` is a static `200 "ok"`, unrelated to any upstream service's own `/healthz`.
