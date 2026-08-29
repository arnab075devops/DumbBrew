# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read `cafe-landing-page-request/project/DumbBrew.dc.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `cafe-landing-page-request/README.md` — this file
- `cafe-landing-page-request/project/` — the `Cafe landing page request` project files (HTML prototypes, assets, components)

---

# Backend

The `backend/` and `infra/` directories contain the DumbBrew backend: two
Node.js/TypeScript microservices (admin auth, events + newsletter),
Postgres, and a full monitoring stack, deployable to OCI on the Always
Free tier via Terraform + OCI DevOps pipelines.

- **Start here for local dev**: [`backend/README.md`](backend/README.md)
- **Why it's built this way**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Deploying to OCI**: [`infra/terraform/README.md`](infra/terraform/README.md), [`infra/devops-pipelines/README.md`](infra/devops-pipelines/README.md)
- **Operating it in production**: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)

Razorpay payments and the media/image-upload service are scoped out of v1
(see `docs/ARCHITECTURE.md` for what's built vs. planned). `rzp-key.csv` in
this directory is a live credential — keep it out of git (already
gitignored) and don't reference it directly from code; use `.env`/OCI Vault
instead.
