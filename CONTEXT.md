# Project context (current state)

Status snapshot for whoever picks this up next (human or AI). For setup
instructions from scratch, see [README.md](README.md); for the "why" behind
the architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This file
is just: what's actually live right now.

## Supabase — connected and live

- Project: `odblggwrwksmycpxaptp` (`https://odblggwrwksmycpxaptp.supabase.co`)
- `supabase/schema.sql` has been run against it — all tables exist, seeded,
  RLS applied.
- `backend/gateway/public/config.js` has the real `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` filled in (no longer the `YOUR-PROJECT` placeholder).
  The anon key is meant to be public (enforced by RLS, not secrecy) so it's
  fine committed as-is.
- Verified via headless browser (`browse` skill) that `index.html`,
  `brews.html`, and `menu.html` all fire real requests to
  `.../rest/v1/{brews,menu_categories,events}` and get 200s with live rows —
  the site is reading from Supabase, not local fallback data or the old
  Postgres/Node backend.

## R2 — not set up yet

`R2_BASE` in `config.js` is still empty, so images serve from the local
`backend/gateway/public/assets/` fallback. That's expected and the site looks
correct either way — see README's "Cloudflare R2 setup" section when ready.

## Legacy Node backend (auth-service, content-service, local Postgres)

Not needed for the public site anymore — everything data-related goes
straight from the browser to Supabase. Only relevant if/when an admin panel
gets built. Docker compose stack for it still exists under `backend/` but
isn't required to view or develop the site.

## Viewing the site locally

No build step, no Docker needed:

```sh
cd backend/gateway/public
python -m http.server 8088
```

Then open `http://localhost:8088/index.html`.

## Known cosmetic issue

On first paint, image `src` attributes briefly contain literal
`{{ templateVar }}` text before the page's JS resolves them, causing harmless
404s in the browser console (e.g. `GET /%7B%7B%20logoUrl%20%7D%7D 404`). Not
user-visible, not a data issue. Fix would be an empty `src` + lazy-load
instead of a literal placeholder string in the HTML — not done, low priority.

## Deployment

Not yet deployed. `vercel.json` at repo root is already configured to point
at `backend/gateway/public` as a static site — see README's "Vercel (the
site)" section to ship it.
