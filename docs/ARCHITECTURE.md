# DumbBrew backend — architecture

## Scope (v1)

Confirmed with the project owner: v1 covers **admin auth** and
**newsletter + events management** only. Razorpay payments and the
Object Storage image-upload/menu-catalog service are a deliberately
separate, later phase — not built yet. The Terraform/Object Storage
groundwork (buckets, IAM) is in place so that phase slots in without
re-architecting.

## Why microservices *and* "most cost-optimized" aren't a contradiction here

True microservices (independently scaled, separately deployed, one
control-plane-managed cluster) cost real money on any cloud — load
balancers, multiple node pools, etc. For an app this size, that cost isn't
justified by the scale. The compromise:

- **Logical separation, not infrastructure separation.** `auth-service` and
  `content-service` are independent codebases, independent deployable
  containers, independent failure domains, communicating only over HTTP/JWT
  — genuinely microservices in the software-architecture sense.
- **Shared, minimal infrastructure.** Both run as containers on *one* OCI
  Always Free Ampere A1 VM (4 OCPU / 24GB — generous for this workload),
  behind one nginx gateway, against one shared Postgres instance (separate
  schemas, not separate databases). This is what keeps compute cost at
  effectively $0.
- **No Kubernetes.** OKE's control plane and worker nodes cost money; Docker
  Compose on a single free VM does not. If/when traffic actually requires
  horizontal scaling, the services are already containerized and stateless
  (JWT auth, no in-memory session state) — moving to OKE or a second VM
  later is a deployment change, not a rewrite.

## Auth model

`auth-service` is the only service that touches admin credentials or issues
tokens. It signs short-lived (15 min) JWT access tokens plus longer-lived
(7 day) rotating refresh tokens (hashed at rest, single-use — each refresh
invalidates the previous token). `content-service` verifies access tokens
**locally**, using the same `JWT_SECRET` both services share via env vars
(and, in production, OCI Vault) — no network call to `auth-service` on the
request path, no shared-fate coupling for read-heavy public endpoints.

There is intentionally no public admin-registration endpoint. The single
cafe-owner account is created/rotated via `npm run seed:admin`, run once
against the database.

## Data

One Postgres instance, two schemas (`auth`, `content`) so each service owns
its tables without needing separate DB infrastructure. Nightly `pg_dump`
backups (cron on the VM, see `infra/terraform/cloud-init.yaml.tpl` and
`backend/db/backup/backup-to-object-storage.sh`) are uploaded to a private
Object Storage bucket with a 30-day lifecycle expiry, keeping storage cost
near zero.

## Monitoring ("properly monitored after deployment")

Prometheus scrapes each service's `/metrics` (`prom-client`: request
duration histograms by route/status, default Node.js process metrics) plus
`node-exporter` (host CPU/mem/disk) and `cadvisor` (per-container
resource usage). Loki + Promtail collect every container's stdout/stderr
(Docker log driver JSON, 7-day Loki retention). Grafana ships with a
provisioned "DumbBrew Backend Overview" dashboard (request rate, error
rate, p95 latency, host CPU/mem, per-container CPU) and a Loki datasource
for log search — see `backend/monitoring/`. All of it runs on the same
free VM; nothing here is a paid SaaS.

Every service also exposes `/healthz` (checks its own DB connectivity),
used by Docker's `HEALTHCHECK`, the nginx gateway's own `/healthz`, and the
post-deploy `validate_service.sh` hook in the DevOps pipeline.

## Image uploads / Object Storage (planned, not yet built)

The Terraform module already creates a `media` Object Storage bucket with
public read / authenticated write, and an IAM dynamic group + policy
granting the app VM instance-principal access to it (no static keys stored
on the box). No app-level file-size cap is planned when this phase is
built — Object Storage's multipart upload supports very large objects
natively, and enforcing an artificial limit would contradict the
"no limitation on picture size" requirement.

## Payments (planned, not yet built)

Razorpay integration was scoped out of v1 per the project owner's decision
(see Scope above). When it's built, the plan is a third service
(`orders-service`) rather than bolting payment logic into
`content-service`, keeping PCI-adjacent code and its secrets isolated.
`rzp-key.csv` in the repo root should be treated as a live credential in
the meantime — moved into `.env`/OCI Vault, never referenced directly, and
never committed (it's already in `.gitignore`).
