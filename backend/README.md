# DumbBrew backend

Two Node.js/TypeScript microservices behind an nginx gateway, backed by one
shared Postgres instance, with Prometheus/Grafana/Loki monitoring — all
designed to run together on a single OCI Always Free VM. See
`../docs/ARCHITECTURE.md` for the why behind these choices and
`../infra/terraform/README.md` for how it gets to OCI.

| Service | Port (internal) | Responsibility |
|---|---|---|
| `gateway` | 80 (public) | nginx reverse proxy, rate limiting, security headers |
| `auth-service` | 4001 | Admin login/refresh/logout, issues JWTs |
| `content-service` | 4002 | Events CRUD, newsletter subscribe/list — admin routes verify the JWT locally using a shared secret |
| `postgres` | 5432 | Single DB, two schemas: `auth`, `content` |
| `prometheus` / `grafana` / `loki` / `promtail` / `node-exporter` / `cadvisor` | — | Monitoring stack |

## Run it locally

1. **Prerequisites**: Docker + Docker Compose v2.
2. Copy the env file and fill in real values (any random strings are fine
   for local dev — just keep `JWT_SECRET` non-trivial):

   ```sh
   cp .env.example .env
   ```

3. Start everything:

   ```sh
   docker compose up --build
   ```

   This builds `auth-service`, `content-service`, and `gateway` from source
   (docker-compose.override.yml is auto-loaded and adds local-dev port
   mappings), starts Postgres and runs `db/init/001_init.sql` automatically
   on first boot, and brings up the monitoring stack.

4. **Seed the admin account** (one-time; there's no public signup endpoint
   by design):

   ```sh
   docker compose exec auth-service sh -c \
     "ADMIN_EMAIL=owner@dumbbrew.example ADMIN_PASSWORD=changeme123 npm run seed:admin"
   ```

5. **Smoke test**:

   ```sh
   # Public: list upcoming events (empty at first)
   curl http://localhost/api/events

   # Public: subscribe to the newsletter
   curl -X POST http://localhost/api/newsletter/subscribe \
     -H "Content-Type: application/json" -d '{"email":"test@example.com"}'

   # Admin login
   curl -X POST http://localhost/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"owner@dumbbrew.example","password":"changeme123"}'
   # -> { "accessToken": "...", "refreshToken": "...", "expiresIn": "15m" }

   TOKEN=<accessToken from above>

   # Admin: create an event
   curl -X POST http://localhost/api/events \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"Cupping Night","eventDate":"2026-09-06"}'

   # Admin: list newsletter subscribers
   curl http://localhost/api/newsletter/subscribers -H "Authorization: Bearer $TOKEN"
   ```

6. **Health/metrics**: `curl http://localhost/healthz`,
   `curl http://localhost:4001/metrics`, `curl http://localhost:4002/metrics`.

7. **Grafana**: http://localhost:3001 (mapped from container port 3000 to
   avoid clashing with other local services — see docker-compose.override.yml)
   (`admin` / value of `GRAFANA_ADMIN_PASSWORD`
   in `.env`). The "DumbBrew Backend Overview" dashboard is auto-provisioned.
   Request-rate/latency panels populate immediately; container/host panels
   need `docker compose --profile monitoring-host up -d node-exporter cadvisor`
   (disabled by default locally — see docker-compose.override.yml).

8. **Logs in Grafana**: Explore → Loki datasource → `{service="gateway"}` (or
   `auth-service` / `content-service`).

## Running tests / type checks

```sh
docker compose exec auth-service npm run lint
docker compose exec content-service npm run lint
```

(There's no separate test suite yet beyond TypeScript's strict-mode checks
and the manual smoke test above — add one under `src/__tests__` per service
before this goes further than a v1.)

## Tearing down

```sh
docker compose down          # keep data
docker compose down -v       # also wipe Postgres/Prometheus/Grafana/Loki volumes
```

## Deploying to OCI

Local testing above should pass first. Then:

1. Provision infra: `../infra/terraform/README.md`.
2. Wire up the OCI DevOps project (build pipeline pushes images to OCIR,
   deploy pipeline rolls them out to the VM): see
   `../infra/devops-pipelines/`.
3. First deploy can also be done by hand over SSH if you want to verify
   before trusting the pipeline:

   ```sh
   ssh ubuntu@<vm-ip>
   cd /opt/dumbbrew
   cp .env.example .env   # fill in real prod secrets
   docker compose up --build -d
   docker compose exec auth-service sh -c "ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin"
   ```
