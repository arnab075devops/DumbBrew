# DumbBrew

A coffee shop marketing site: a home page plus five detail pages (Brews,
Menu, Story, Gallery, Visit), all reachable from the top nav. Static
HTML/CSS/JS (no build step, no framework) — content comes from Supabase and
images from Cloudflare R2, both with local fallbacks so the site works fully
before either is configured.

## About the design files

The `project/` directory is the original Claude Design handoff bundle this
site was built from — `project/DumbBrew.dc.html` is a single-page mockup, not
the live site. **The real site is `backend/gateway/public/`.** Read the
prototype for visual reference only; don't treat it as the thing to deploy.

## Site structure

```
backend/gateway/public/
  index.html    Home — teaser sections, links out to each detail page
  brews.html    All brews
  menu.html     Full menu
  story.html    Our story + milestones
  gallery.html  Brew methods, one card per method
  visit.html    Hours, address, parking/wifi/groups
  config.js     Supabase + R2 + legacy-API config — the one file you edit
  assets/       Local fallback images (used until R2_BASE is set)
```

Every page is self-contained HTML using the same "design canvas" component
format (a tiny `DCLogic`/React runtime loaded from `support.js`) — nav,
footer, fonts, and the GSAP scroll-reveal/parallax system are duplicated
across each file on purpose (no build step means no shared includes; if you
add a sixth page, copy an existing one and adjust the middle section).

## Quick start (no accounts needed)

The site works out of the box against its local fallback data and images —
you don't need Supabase or R2 to look at it:

```sh
cd backend
docker compose up --build gateway
```

Open `http://localhost`. (Or skip Docker entirely and open
`backend/gateway/public/index.html` directly in a browser — everything
except the two backend microservices, which nothing on the public site
depends on anymore, works from the file directly.)

To wire up real content, do the two setups below, then edit
`backend/gateway/public/config.js`.

## Supabase setup (content: brews, menu, story, events, testimonials, visit info)

1. Create a project at [supabase.com](https://supabase.com) (free tier is
   plenty for this).
2. Open the SQL Editor in the Supabase dashboard, paste in the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates
   every table the site reads from, sets up row-level security (public read
   on content tables, public insert-only on `newsletter_subscribers`), and
   seeds it with the same content currently hardcoded as fallback — so the
   site looks identical at first, but now the data lives in Supabase and you
   can edit it from the Table Editor without touching code.
3. In Project Settings → API, copy the **Project URL** and the **anon
   public** key (not the service role key — that one must never reach the
   browser).
4. Paste both into `backend/gateway/public/config.js`:

   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...',
   ```

That's it — every page's Supabase fetch (`window.supabaseSelect` /
`window.supabaseInsert` in `config.js`) picks it up immediately, no rebuild
step. If a fetch fails (wrong keys, RLS misconfigured, offline), each page
falls back to its hardcoded defaults and logs a `console.warn` — the site
never shows a broken/empty state.

## Cloudflare R2 setup (images)

1. In the Cloudflare dashboard, create an R2 bucket (e.g. `dumbbrew-media`).
2. Enable public access on the bucket — either the bucket's `r2.dev` public
   URL (fine for testing) or, better, connect a custom subdomain (e.g.
   `media.dumbbrew.com`) via R2 → Settings → Custom Domains.
3. Upload every file from `backend/gateway/public/assets/` to the bucket
   root, keeping the filenames as-is (`db-logo.png`, `brew-regular.jpg`,
   `method-pour-over.jpg`, etc.) — the site references images by filename
   only, so key names must match exactly.
4. Set the base URL in `config.js`:

   ```js
   R2_BASE: 'https://media.dumbbrew.com',   // no trailing slash
   ```

Leave `R2_BASE` empty (`''`) to keep serving the images checked into
`assets/` instead — useful for local dev or before R2 is set up. When you
add a new brew/method/etc. in Supabase, its `image_key` column should be
just the filename (e.g. `new-brew.jpg`); the site builds the full URL from
`R2_BASE` at render time via `assetUrl()` in `config.js`.

## Deploying

**Now:** Vercel (frontend) + Railway (optional legacy backend). **Later,
after rollout:** Oracle Cloud, via the existing Terraform setup in
`infra/terraform/` — see `infra/terraform/README.md` when you get there. The
frontend itself doesn't change for that move; only where it's hosted does.

### Vercel (the site)

1. Push this repo to GitHub/GitLab and import it in the Vercel dashboard
   (or `vercel` CLI from the repo root).
2. Vercel reads [`vercel.json`](vercel.json) at the repo root, which points
   `outputDirectory` at `backend/gateway/public` — no build command needed,
   it's static files. You shouldn't need to touch project settings.
3. Before your first deploy (or any time after), edit
   `backend/gateway/public/config.js` with real Supabase/R2 values and
   commit — there's no env-var injection step, the file is read as-is by
   the browser (the Supabase anon key is meant to be public; RLS in
   `supabase/schema.sql` is what actually restricts access).
4. Deploy. Every page (`/index.html`, `/brews.html`, ...) is served as a
   static file; there's no server-side routing to configure.

### Railway (optional — only if you still want the Node admin backend)

The public site no longer calls `auth-service` or `content-service` for
anything — events, newsletter signups, and every other list now go through
Supabase directly from the browser (see `backend/README.md` for what these
services still do: admin login and CRUD, useful if you build an admin panel
later, but not required for the site to work).

If you want them running anyway:

1. Create a Railway project, add a service per directory: `backend/services/auth-service`
   and `backend/services/content-service` (Railway auto-detects each
   Dockerfile — set the service's root directory to that path).
2. Add a Railway Postgres plugin, or point `DATABASE_URL` at any reachable
   Postgres instance, and set the same env vars as `backend/.env.example`
   (`JWT_SECRET`, `CORS_ORIGIN`, etc.).
3. Deploy. These services are now decoupled from the public site's uptime —
   treat them as an internal admin tool.

### Oracle Cloud (future, after initial rollout)

The original plan for this project — see `docs/ARCHITECTURE.md` — was a
single OCI Always Free VM running the full `docker-compose.yml` stack
(gateway + both services + Postgres + monitoring), provisioned via
`infra/terraform/` and deployed through `infra/devops-pipelines/`. That path
still works unchanged for the backend services. When you're ready to move
the frontend off Vercel too, the gateway's nginx already serves
`backend/gateway/public/` as-is — same `docker compose up --build` flow
described in `backend/README.md`, just self-hosted instead of on Vercel.
Nothing about this migration changes `config.js`; Supabase and R2 are
already external services independent of where the HTML is served from.

## More detail

- **Local dev / the legacy Node backend**: [`backend/README.md`](backend/README.md)
- **Why it's built this way**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Deploying to OCI**: [`infra/terraform/README.md`](infra/terraform/README.md), [`infra/devops-pipelines/README.md`](infra/devops-pipelines/README.md)
- **Operating it in production**: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)

Razorpay payments are scoped out of v1. `rzp-key.csv` in this directory is a
live credential — keep it out of git (already gitignored) and don't
reference it directly from code; use `.env`/OCI Vault/Vercel env vars
instead.
