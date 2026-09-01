#glossary

# Glossary

Parent: [[Home]]

| Term | Meaning |
|---|---|
| **Admin** | The single cafe-owner account. Identity in local Postgres `auth.admins`. See [[Auth Identity Systems]] §1. |
| **Anon key** | Supabase's public API key. Meant to be public — access is enforced by RLS, not by hiding this key. |
| **Authentik** | Self-hosted OIDC/SSO identity provider used for **customer** accounts only (not admin, not seller). Runs as 4 containers in the compose stack. |
| **`auth.uid()`** | Postgres/Supabase function that resolves the current request's identity from its JWT `sub` claim — what every customer-scoped RLS policy keys on. Only resolves for tokens signed with `SUPABASE_JWT_SECRET`; never resolves for seller or admin tokens. |
| **`config.js`** | `backend/gateway/public/config.js` — the one file with runtime config the frontend reads. See [[config.js Reference]]. |
| **House seller** | DumbBrew's own catalog, modeled as a `sellers` row with `is_house=true` — no special-cased code path. See `order-service/src/scripts/seed-house-seller.ts`. |
| **`image_key`** | A bare filename (e.g. `brew-regular.jpg`) stored in the DB; `assetUrl()` in `config.js` turns it into a full R2 or local-fallback URL at render time. |
| **PostgREST** | The auto-generated REST API Supabase exposes over its Postgres tables — what `supabaseSelect`/`supabaseInsert`/etc. in `config.js` call directly from the browser. |
| **PKCE** | Proof Key for Code Exchange — the OAuth2 flow variant used for customer login against Authentik, implemented with Web Crypto directly in `login.html`/`auth-callback.html` (no OIDC client library). |
| **RLS** | Row Level Security — Postgres policies that gate which rows a query can see/touch based on the requesting role/JWT. The real access-control mechanism for anything read directly from the browser; bypassed entirely by the service-role key. |
| **Seller** | A marketplace vendor. Standalone identity (email+password in the `sellers` table itself), not a customer account, not Authentik. See [[Auth Identity Systems]] §3. |
| **Service-role key** | Supabase's privileged API key that **bypasses RLS**. Used only server-side (`auth-service`, `order-service`), never sent to the browser. |
| **`v1` scope** | The original, narrower project scope per `docs/ARCHITECTURE.md`: admin auth + newsletter/events management only. Marketplace/Razorpay/customer-SSO were built later, beyond that original scope. |

## See also

[[Home]] for the full map, [[Auth Identity Systems]] for the three identity systems, [[Two Databases]] for the local-Postgres-vs-Supabase split.
