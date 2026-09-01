#infra

# Vercel Deploy

Parent: [[Home]] · See also: [[gateway]], [[config.js Reference]], [[Current Status]]

**Status:** this is the **current** intended production path for the frontend (per README.md's "Now: Vercel... Later: Oracle Cloud"), though [[Current Status]] notes it's not actually deployed yet as of the last snapshot.

## How it's wired

`vercel.json` at repo root points `outputDirectory` at `backend/gateway/public` — no build command, it's pure static files. Every page (`/index.html`, `/brews.html`, ...) is served as-is; no server-side routing to configure.

## Steps

1. Push the repo to GitHub/GitLab, import in the Vercel dashboard (or `vercel` CLI from repo root).
2. Before first deploy (or anytime after): edit `backend/gateway/public/config.js` with real Supabase/R2/Authentik values and commit — **no env-var injection step on Vercel for this project**, the file is read as-is by the browser. The Supabase anon key is meant to be public (RLS is the real gate); other values in `config.js` follow the same "committed as config, not secret" model — see [[config.js Reference]].
3. Deploy.

## What does and doesn't work on Vercel alone

- **Works with zero backend:** every marketing page, browsing `shop.html`, viewing content — all direct-to-Supabase/R2.
- **Needs the backend running somewhere** (currently: local Docker only — see [[Docker Compose]]): customer registration/login, cart/checkout/payments, seller application/dashboard, admin. `API_BASE` in `config.js` has to point at a reachable gateway for these to work; if it's `http://localhost`, only someone running the local stack can use them.

## Railway (optional, legacy)

README mentions Railway as an option for running `auth-service`/`content-service` standalone if you want the admin-CRUD backend without the full OCI/Terraform path — add a Railway service per directory (Dockerfile auto-detected), a Postgres plugin or external `DATABASE_URL`, and the same env vars as `.env.example`. Decoupled from the public site's uptime either way. **Not mentioned for `order-service`** in the README — if pursuing this path, order-service would need the same treatment plus its non-Postgres env vars (Supabase/Razorpay/R2/seller-JWT), see [[Docker Compose]].
