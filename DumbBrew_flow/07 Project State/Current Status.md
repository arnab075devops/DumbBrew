#gap

# Current Status

Parent: [[Home]] · Primary source of truth: **`CONTEXT.md` at repo root — read that file directly for the latest snapshot, this note summarizes it as of 2026-09-01 and will go stale faster than the code does.**

This note exists so Claude doesn't have to re-read all of `CONTEXT.md` just to get oriented, but for anything you're about to *act* on, re-check `CONTEXT.md` and the relevant code — this is a summary of a point-in-time snapshot, not a live status feed.

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

See [[Known Gaps]] for the technical-debt-shaped items (session refresh, CI/CD gap, `creds.txt` gitignore status) rather than status snapshot items.
