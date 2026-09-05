#gap

# Current Status

Parent: [[Home]] · Primary source of truth: **`CONTEXT.md` at repo root — read that file directly for the latest snapshot.** As of this update (2026-09-05, commit `98fc84b`), `CONTEXT.md` itself is stale — it still describes commit `349810a` ("Add customer accounts with Authentik SSO") and predates the marketplace/seller/Razorpay work below. Don't treat `CONTEXT.md` as more current than this note until someone refreshes it.

This note exists so Claude doesn't have to re-read all of `CONTEXT.md` just to get oriented, but for anything you're about to *act* on, re-check the relevant code — this is a summary of a point-in-time snapshot, not a live status feed. See [[Credentials]] for actual secret values and reachable URLs.

## Since the last `CONTEXT.md` snapshot (commits `223e893` → `98fc84b`)

- **Sellers are now a standalone identity** (not customer accounts): public
  application flow (`seller-apply.html` → `sellerApplications.controller.ts`),
  admin review/approval with a one-time generated password
  (`admin-sellers.html` → `adminSellers.controller.ts`), seller login/reset
  (`sellerAuth.controller.ts`), and a Shopify-style seller dashboard
  (`seller-dashboard.html`) for managing their own catalog. See [[Credentials]]
  for why there's no fixed seller demo login to record.
- **Razorpay integration** landed in `order-service` for checkout/payments
  (test-mode keys, see [[Credentials]]).
- **Latest commit (`98fc84b`, "Some kind of major changes")** added admin
  reports (`adminReports.controller.ts`/`reports.routes.ts`), an admin visit
  endpoint (`adminVisit.controller.ts`), product reviews
  (`reviews.controller.ts`/`reviews.routes.ts`), expanded `admin-sellers.html`
  and `seller-dashboard.html` significantly, touched `nginx.conf`, and added
  91 lines to `supabase/schema.sql` — the [[Supabase Schema]] and
  [[API Endpoint Map]] notes have not been re-verified against these yet;
  treat their route/table lists as pre-marketplace-expansion until someone
  re-reads the new controllers/schema.
- **Grafana** is on `http://localhost:3000` (bound to `127.0.0.1:3000` in
  `docker-compose.yml`), not `3001` as this note previously said.
- **Tutorials feature (`2ae407d`, `4aa19f5`, 2026-09-06)**: admin-authored
  recipe/how-to articles — `tutorials` Supabase table, `order-service`'s
  `/api/admin/tutorials` CRUD (`adminTutorials.controller.ts`), public
  `tutorials.html`/`tutorial.html` (read Supabase directly, published-only),
  and a Tutorials tab inside `admin-sellers.html` (Quill editor; the old
  standalone `admin-tutorials.html` was merged in and removed). Uses its own R2 bucket
  (`R2_TUTORIALS_BASE`/`R2_TUTORIALS_BUCKET`), separate from the main asset
  bucket. See [[Frontend Pages]], [[API Endpoint Map]], [[Supabase Schema]].
  The same `2ae407d` commit also added a `wishlist` feature and touched
  `products.controller.ts` — **not yet reflected** in the vault, out of scope
  for this update. A follow-up commit (`4aa19f5`) fixed a real nav bug this
  introduced: adding the Tutorials link broke unrelated nav items
  intermittently because `auth-nav.js`/`search.js` were detaching/reparenting
  DOM nodes the site's `DCLogic`/React runtime still owned — see the gotcha
  note in [[Frontend Pages]] before writing any future nav-injecting script.

## What's live and verified (as of the last CONTEXT.md update)

- **Supabase**: connected, `schema.sql` applied, seeded, RLS on. `config.js` has real project URL/anon key. Verified via headless browser that `index.html`/`brews.html`/`menu.html` fetch real rows.
- **R2**: connected, all 16 site images uploaded and resolving with 200s.
- **Local Docker stack**: running, including Authentik. `backend/.env` has real secrets (gitignored, not committed).
- **Customer accounts (Authentik SSO)**: registration and login both verified end-to-end in a real browser, including RLS isolation (a second test account can't see the first's row).
- **Git**: pushed to `main`. Remote moved from `ArnabAdhikar/DumbBrew.git` to `arnab075devops/DumbBrew.git` — push still works via GitHub's redirect, but local `origin` URL hasn't been updated to the canonical one (also tracked in Claude's separate cross-session memory, outside this vault).

## What's NOT yet done

- **Not deployed anywhere public.** `vercel.json` is ready but nothing's been pushed to Vercel per the last snapshot — verify current state before assuming it's live.
- **`order-service` is absent from the OCI CI/CD pipeline** (`infra/devops-pipelines/build_spec.yaml`) — see [[Terraform OCI]] and [[Known Gaps]]. This means the Terraform/OCI path can't currently deploy the marketplace even if pursued.
- **`content-service` is effectively unused** by the live site — see [[Two Databases]]. Kept for a possible future admin panel.

## Cosmetic / minor known issues

- First-paint flash of literal `{{ templateVar }}` text in `src` attributes before JS resolves them → harmless 404s in console. Fix would be empty `src` + lazy-load; not done, low priority.

## Legal caveat worth repeating if asked

`terms.html`/`data-policy.html` are a solid DPDP Act 2023-aware draft, **not lawyer-reviewed** — say so if the user asks about shipping this for real, especially the Grievance Officer / hosting-region placeholders still in `data-policy.html`.

See [[Known Gaps]] for the technical-debt-shaped items (session refresh, CI/CD gap, `creds.txt` gitignore status) rather than status snapshot items, and [[Credentials]] for every actual secret/URL currently in use.
