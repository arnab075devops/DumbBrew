#infra

# Repo Map

Parent: [[Home]] · See also: [[System Overview]]

Root: `C:\Users\arnab\OneDrive\Desktop\DumbBrew`

```
DumbBrew/
├── README.md                    Setup from scratch (Supabase/R2 setup, deploy instructions)
├── CONTEXT.md                   Living "what's actually live right now" snapshot — read before README for current state
├── vercel.json                  Points Vercel's outputDirectory at backend/gateway/public
├── creds.txt                    ⚠ NOT in .gitignore — if this holds real secrets it is committed
│                                  to git history. See [[Known Gaps]].
│
├── backend/
│   ├── docker-compose.yml       Full local/prod stack: postgres, auth-service, content-service,
│   │                            order-service, gateway, prometheus, grafana, loki, promtail,
│   │                            node-exporter, cadvisor, authentik-postgres, authentik-redis,
│   │                            authentik-server, authentik-worker
│   ├── docker-compose.override.yml   Local dev overrides (likely bind mounts/hot reload — check before assuming prod parity)
│   ├── docker-compose.prod.yml       Prod-only overrides (image tags etc.)
│   ├── .env / .env.example      Real secrets (gitignored) / template — see [[Docker Compose]]
│   ├── README.md                Legacy Node backend + local dev instructions
│   │
│   ├── gateway/                 nginx reverse proxy + static file server — see [[gateway]]
│   │   ├── nginx.conf           Routing table: which /api/* prefix goes to which service, rate-limit zones
│   │   ├── proxy_params.conf    Shared proxy_pass headers
│   │   ├── Dockerfile           Bakes public/ into the image at BUILD time (no volume mount — rebuild to see edits)
│   │   └── public/              *** THE LIVE SITE *** — every page, config.js, local fallback images
│   │       ├── index.html, brews.html, menu.html, story.html, gallery.html, visit.html   Marketing pages
│   │       ├── register.html, login.html, auth-callback.html, account.html               Customer auth/profile
│   │       ├── terms.html, data-policy.html                                              Legal (DPDP-aware draft, not lawyer-reviewed)
│   │       ├── shop.html, cart.html                                                      Marketplace shopping
│   │       ├── seller-apply.html, seller-register.html, seller-dashboard.html            Seller-facing
│   │       ├── admin-sellers.html                                                        Admin seller approval queue
│   │       ├── _preview-account.html                                                     Scratch/preview file — verify still needed before treating as live
│   │       ├── config.js        *** THE ONE FILE YOU EDIT *** — Supabase/R2/API/Authentik config, fetch helpers
│   │       └── assets/          Local fallback images (used when R2_BASE is empty)
│   │
│   ├── services/                Three independent Fastify+TypeScript microservices — see [[auth-service]], [[content-service]], [[order-service]]
│   │   ├── auth-service/        Admin JWT auth + customer registration/session (Authentik+Supabase) — see [[auth-service]]
│   │   ├── content-service/     Legacy admin events/newsletter CRUD (local Postgres) — see [[content-service]]
│   │   └── order-service/       Marketplace: sellers/products/cart/orders/payments (Supabase) — see [[order-service]]
│   │
│   ├── db/
│   │   ├── init/001_init.sql    Local Postgres bootstrap: auth.admins, auth.refresh_tokens,
│   │   │                        content.events, content.newsletter_subscribers
│   │   └── backup/               pg_dump-to-Object-Storage backup script (see [[Terraform OCI]])
│   │
│   └── monitoring/               Prometheus/Grafana/Loki/Promtail configs — see [[Monitoring]]
│       ├── prometheus/, grafana/provisioning/, loki/
│
├── supabase/
│   └── schema.sql                *** THE SUPABASE SCHEMA *** — public content tables, customers,
│                                  full marketplace (sellers/products/variants/cart/orders), RLS
│                                  policies, seed data. Idempotent, re-runnable. See [[Supabase Schema]].
│
├── docs/
│   ├── ARCHITECTURE.md           The "why" — microservices-but-cheap rationale, v1 scope decisions
│   ├── AUTHENTIK_SETUP.md        One-time manual Authentik dashboard/API setup steps
│   └── RUNBOOK.md                Ops: health checks, failed-deploy recovery, DB restore, key rotation
│
├── infra/
│   ├── terraform/                 OCI Always Free VM provisioning — see [[Terraform OCI]]
│   └── devops-pipelines/          OCI DevOps build/deploy pipeline specs + shell hooks
│
├── project/                       Original Claude Design handoff bundle (project/DumbBrew.dc.html) —
│                                   visual reference ONLY, not the live site, don't deploy from here
│
├── asset/                         Raw/unoptimized source images (100MB+, git-ignored — see .gitignore).
│                                   NOT used by the site; the compressed web-ready copies actually
│                                   served live in backend/gateway/public/assets/ and project/assets/
│
└── DumbBrew_flow/                 *** THIS VAULT *** — Obsidian notes, not code
```

## Fast lookups

- **"I need to change what the homepage shows"** → `backend/gateway/public/index.html` (+ maybe `supabase/schema.sql` seed data if it's content, not layout).
- **"I need to add an API endpoint"** → pick the right service in `backend/services/*/src/routes/` + `controllers/`, then add the nginx `location` block in `backend/gateway/nginx.conf`. Cross-check [[API Endpoint Map]] for existing conventions (rate-limit zone, auth middleware pattern).
- **"I need to add/change a database table"** → `supabase/schema.sql` for anything the public site or marketplace touches; `backend/db/init/001_init.sql` only for admin/events/newsletter (rare — that stack is legacy).
- **"I need to change a deploy step"** → `infra/terraform/` (OCI provisioning) or `infra/devops-pipelines/` (CI/CD) or `vercel.json` (frontend hosting).
- **Live credentials that must never be committed in full**: `backend/.env` (gitignored), `creds.txt` (verify gitignore status), `rzp-key.csv` mentioned in README (verify current location/gitignore — treat as sensitive if found).
