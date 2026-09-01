# DumbBrew — Vault Home

This vault is a **map of the DumbBrew repository**, kept separate from the code so Claude (or you) can answer most "where/how does X work" questions from here without re-reading the whole tree. It documents *structure and mechanism*, not day-to-day task status — for what's currently live/broken, see [[Current Status]].

Repo root: `C:\Users\arnab\OneDrive\Desktop\DumbBrew`. This vault lives at `DumbBrew_flow/` inside it, gitignored-or-not doesn't matter — it's notes, not code.

> [!warning] Keep this in sync
> This vault was generated 2026-09-01 from a direct read of the source. It will drift as the code changes. When you (Claude) make a structural change — a new route, a new table, a new service — update the relevant note in the same session. Don't trust a stale endpoint list over `grep`; verify before relying on specifics for anything you're about to act on.

## Start here

- **New to the repo?** Read [[System Overview]] first, then [[Repo Map]].
- **"Where's the code for X?"** → [[Repo Map]] or the relevant service note in `02 Services/`.
- **"What does endpoint Y do / what auth does it need?"** → [[API Endpoint Map]].
- **"What tables exist, and who's allowed to touch them?"** → [[Supabase Schema]] (marketplace + public site content) or [[Local Postgres Schema]] (legacy admin/events).
- **"How does login/auth work?"** → [[Auth Identity Systems]] — there are **three separate identity systems**, don't conflate them.
- **"What page has feature Z?"** → [[Frontend Pages]].
- **"How do I run/deploy this?"** → [[Docker Compose]], [[Vercel Deploy]], [[Terraform OCI]].
- **"What's actually live right now / what's half-built?"** → [[Current Status]] and [[Known Gaps]].

## The one-paragraph version

DumbBrew is a coffee-shop marketing site that grew a marketplace. The **live production path** is: static HTML/JS in `backend/gateway/public/` reads content directly from **Supabase** (Postgres + PostgREST + RLS) and images from **Cloudflare R2**, with no backend server required for browsing. Three **optional** Fastify microservices sit behind an nginx gateway for everything that needs a trusted server: `auth-service` (admin JWT auth + customer registration/login via self-hosted **Authentik** SSO), `content-service` (legacy admin-only events/newsletter CRUD against a **separate local Postgres**), and `order-service` (the marketplace: sellers, products, cart, checkout, Razorpay payments — talks to Supabase with the service-role key, not local Postgres). See [[System Overview]] for the full picture and [[Two Databases]] for why there are two different Postgres instances in play.

## Map of Content

```
01 Architecture/    → System Overview, Repo Map, Two Databases, Auth Identity Systems
02 Services/         → one note per deployable: gateway, auth-service, content-service, order-service
03 API Reference/    → API Endpoint Map (every route), Rate Limits
04 Data Model/       → Supabase Schema, Local Postgres Schema
05 Frontend/         → Frontend Pages, config.js Reference
06 Infra and Deploy/ → Docker Compose, Terraform OCI, Vercel Deploy, Monitoring
07 Project State/    → Current Status, Known Gaps
Glossary.md
```

## Tags used throughout

`#service` `#route` `#table` `#page` `#infra` `#auth-system` `#gap` — use Obsidian's search/graph view to pivot by tag if a specific note's links aren't enough.
