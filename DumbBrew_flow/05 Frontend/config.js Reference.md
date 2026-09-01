#page #infra

# config.js Reference

Parent: [[Home]] · See also: [[Frontend Pages]], [[gateway]], [[Auth Identity Systems]]

**Path:** `backend/gateway/public/config.js` — *the one file you edit* to point the frontend at real Supabase/R2/Authentik/API values. No build step: read directly by the browser, no env-var injection. Loaded by every page before its inline script runs.

> [!warning] Gateway bakes this in at build time
> Editing this file has no effect on the running Docker gateway until `docker compose up -d --build gateway` — see [[gateway]]'s cache warning. On Vercel it's just a static file, deployed as committed.

## `window.APP_CONFIG` fields

| Field | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project + public anon key. The anon key is meant to be public — access is enforced by RLS in `supabase/schema.sql`, not by hiding the key. |
| `R2_BASE` | Cloudflare R2 public bucket base URL, no trailing slash. Empty string (`''`) falls back to `./assets/` (checked-in local images). |
| `API_BASE` | The gateway origin (nginx + the three Fastify services). Only things that need a trusted server go through this — customer registration/session, cart/checkout/payments, seller/admin flows. |
| `AUTHENTIK_URL`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_REDIRECT_URI` | Customer SSO — see [[Auth Identity Systems]] §2. `AUTHENTIK_REDIRECT_URI` is computed as `window.location.origin + '/auth-callback.html'`, not hardcoded, so it works across environments without editing. |
| `TERMS_VERSION` | Must exactly match `auth-service`'s `TERMS_VERSION` env var — registration 400s (`stale_terms_version`) otherwise. Bump both together whenever `terms.html`/`data-policy.html` materially change. |

## Helper functions it defines on `window`

| Function | Used for |
|---|---|
| `assetUrl(name)` | `R2_BASE + '/' + name` if set, else `./assets/' + name`. Every `image_key` column in Supabase stores just a filename — this is what turns it into a full URL. |
| `supabaseSelect(table, query)` | Anonymous read from Supabase PostgREST. Used by every marketing page and by `shop.html`'s public catalog. |
| `supabaseSelectAs(table, query, accessToken)` | Authenticated read — `accessToken` is the customer session JWT `auth-service` minted (see [[Auth Identity Systems]] §2), sent as the `Authorization` bearer while `apikey` stays the anon key (Supabase requires it on every REST call regardless). This is what makes `auth.uid()` resolve in RLS. |
| `supabaseUpdateAs(table, matchQuery, patch, accessToken)` | Authenticated PATCH — e.g. `account.html` editing the signed-in customer's own `status`. `matchQuery` should pin the row explicitly (RLS would block a mismatched row anyway, but this avoids relying on "no filter = every visible row" PostgREST behavior). |
| `supabaseInsert(table, row)` | Anonymous insert — only usable where RLS explicitly grants `anon` insert (currently just `newsletter_subscribers`). |
| `orderApiRequest(path, init, accessToken)` | Calls **`order-service`** through the gateway (`API_BASE + path`), not Supabase directly — used by `cart.html`, `seller-dashboard.html`, `admin-sellers.html`, `seller-apply.html` for everything under `/api/cart`, `/api/addresses`, `/api/orders`, `/api/payments`, `/api/sellers`, `/api/admin/sellers`. `order-service` does its own `req.customerId`/`req.sellerId` scoping server-side rather than relying on RLS passthrough — see [[order-service]]. |

## Live values currently in this file (do not paste these elsewhere unnecessarily)

Real Supabase project `odblggwrwksmycpxaptp`, a live R2 `pub-...r2.dev` bucket URL, and a real Authentik client ID are already filled in per [[Current Status]] — check the file itself for exact current values rather than trusting a copy here, since these rotate.
