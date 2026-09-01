#infra

# Docker Compose

Parent: [[Home]] · See also: [[System Overview]], [[gateway]], [[Monitoring]]

**File:** `backend/docker-compose.yml` (+ `docker-compose.override.yml` for local dev, `docker-compose.prod.yml` for prod-only overrides). Run from `backend/`: `docker compose up --build -d`.

## Services in the stack

| Service | Image/build | Notes |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Local DB for `auth-service`/`content-service` — see [[Two Databases]]. Inits from `backend/db/init/`. |
| `auth-service` | build `./services/auth-service` | Port 4001 internal (`expose`, not `ports` — only reachable via the gateway/docker network). 0.5 CPU / 256M limit. |
| `content-service` | build `./services/content-service` | Port 4002 internal. Same resource limits. |
| `order-service` | build `./services/order-service` | Port 4003 internal. `depends_on: []` override — no local Postgres dependency (talks to Supabase only). Requires several `?:`-marked env vars (Razorpay, seller JWT, R2) — compose refuses to start without them, see below. |
| `gateway` | build `./gateway` | The only service with a host-published port (`80:80`). Depends on all three services. |
| `prometheus` | `prom/prometheus:v2.54.1` | 7-day retention. |
| `grafana` | `grafana/grafana:11.1.4` | Bound to `127.0.0.1:3000` only (not public) — tunnel to reach it, per `infra/terraform/README.md`. |
| `loki` + `promtail` | `grafana/loki:3.1.1` / `promtail:3.1.1` | Promtail reads `/var/run/docker.sock` to collect every container's stdout/stderr. |
| `node-exporter`, `cadvisor` | host/container resource metrics | |
| `authentik-postgres`, `authentik-redis`, `authentik-server`, `authentik-worker` | `ghcr.io/goauthentik/server:2024.10.4` etc. | Authentik gets its **own** Postgres+Redis, not the shared one — it runs its own first-party migrations and expects to own its DB outright. `authentik-server` is the only container with a directly host-published port (`9000:9000`) besides the gateway — no domain/TLS exists yet to path-proxy it through nginx, see [[Terraform OCI]]. |

## Required env vars that will hard-fail `docker compose up` if unset

Anything written `${VAR:?message}` in the compose file is a hard requirement, not a default-with-fallback: `POSTGRES_PASSWORD`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SELLER_JWT_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `GRAFANA_ADMIN_PASSWORD`, `AUTHENTIK_SECRET_KEY`, `AUTHENTIK_POSTGRES_PASSWORD`. Everything else has a `:-default` fallback. Real values live in `backend/.env` (gitignored — see `.env.example` for the shape).

## Things that bit people before (see [[Current Status]] / [[Known Gaps]])

- **Regenerating `backend/.env` from scratch is dangerous** if containers are already running — a fresh random `.env` would orphan the already-running Postgres volume's real credentials on next restart. If it ever needs rebuilding, `docker ps` first and recover real values via `docker inspect` on the live containers, rather than generating fresh secrets blind.
- **`x-service-common` YAML anchor** (`&service-common`) is shared by `auth-service`/`content-service`, including a Postgres `depends_on: condition: service_healthy`. `order-service` uses the anchor too but then explicitly overrides `depends_on: []` — if you add a new service and forget this override, it'll wait on a Postgres health check it doesn't need.
- **`AUTHENTIK_CLIENT_ID`/`AUTHENTIK_CLIENT_SECRET`/`AUTHENTIK_ISSUER`/`SUPABASE_JWT_SECRET`** must be set in **both** `.env` and explicitly listed in `auth-service`'s `environment:` block here — compose only passes through vars a service's block explicitly names, `.env` alone isn't enough. Same rule applies to any new env var you add to any service.
