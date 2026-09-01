#infra

# Monitoring

Parent: [[Home]] · See also: [[Docker Compose]]

**Path:** `backend/monitoring/` · All self-hosted in the same compose stack — no paid SaaS.

## Stack

| Component | Role | Config |
|---|---|---|
| Prometheus | Scrapes `/metrics` on each of `auth-service`/`content-service`/`order-service` (`prom-client`: request-duration histograms by route+status, default Node.js process metrics) + `node-exporter` (host CPU/mem/disk) + `cadvisor` (per-container resource usage) | `backend/monitoring/prometheus/prometheus.yml`, 7-day retention |
| Grafana | Pre-provisioned "DumbBrew Backend Overview" dashboard (request rate, error rate, p95 latency, host CPU/mem, per-container CPU) + a Loki datasource | `backend/monitoring/grafana/provisioning/`. Bound to `127.0.0.1:3000` only in prod — see [[Terraform OCI]]'s tunnel command. |
| Loki + Promtail | Collects every container's stdout/stderr via the Docker JSON log driver, 7-day retention | `backend/monitoring/loki/` |

## Per-service instrumentation pattern

Every Fastify service (`auth-service`, `content-service`, `order-service`) implements the **same** `onRequest`/`onResponse` hook pair independently (not shared code) to record a `http_request_duration_seconds` histogram labeled by `method`/`route`/`status_code`, plus exposes it at `GET /metrics` alongside `prom-client`'s default Node.js metrics. If you add a fourth service, copy this pattern from any existing `index.ts`.

## Health checks

Every service exposes `GET /healthz` (checks its own DB connectivity where relevant — `order-service`'s is trivial since it has no local DB, see [[order-service]]). Used by: Docker's own `HEALTHCHECK`, the gateway's separate static `/healthz` (unrelated, just `200 "ok"`), and `infra/devops-pipelines/scripts/validate_service.sh` post-deploy.

## Ops runbook

See `docs/RUNBOOK.md` for: checking health remotely, recovering from a failed `validate_service.sh` deploy, restoring a DB backup from Object Storage, rotating the admin password / `JWT_SECRET`, and diagnosing high CPU/memory via Grafana + `docker stats`.
