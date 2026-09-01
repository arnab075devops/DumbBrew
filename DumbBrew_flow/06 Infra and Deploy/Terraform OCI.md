#infra

# Terraform OCI

Parent: [[Home]] · See also: [[Docker Compose]], [[System Overview]]

**Path:** `infra/terraform/` · **Status:** groundwork exists, **not yet the live deployment target** — see [[Current Status]] (nothing deployed there yet; frontend is on Vercel, backend runs locally in Docker for now).

## What it provisions (all inside OCI's Always Free tier — see file header comment in `infra/terraform/README.md`)

- 1x `VM.Standard.A1.Flex` (4 OCPU / 24GB Ampere) — runs the *entire* `docker-compose.yml` stack as containers, not one VM per service.
- 1x 100GB boot volume.
- VCN + subnet + Internet Gateway + security list (`network.tf`).
- 2x Object Storage buckets: `media` (public read / authenticated write — the planned future home for seller/product image uploads at scale) and a DB-backups bucket with a 30-day lifecycle expiry (`object_storage.tf`).
- IAM dynamic group + policy granting the VM instance-principal access to Object Storage — **no static AWS/OCI keys stored on the box** (`iam.tf`).
- `devops.tf` — OCI DevOps project, OCIR container repos, build + deploy pipelines (see [[Terraform OCI]]#devops-pipeline below and `infra/devops-pipelines/README.md`).

## Files

```
versions.tf                Provider pins, remote state backend (commented out by default)
variables.tf                Every input variable — read before terraform apply
terraform.tfvars.example    Copy to terraform.tfvars (gitignored) and fill in
compute.tf                  The VM itself, cloud-init reference
network.tf                  VCN/subnet/IGW/security list — also opens port 9000 for Authentik (no TLS/domain yet)
object_storage.tf           media + backups buckets
iam.tf                      Dynamic group + policy for instance-principal Object Storage access
devops.tf                   DevOps project/pipelines (build_spec.yaml, deploy_spec.yaml referenced from infra/devops-pipelines/)
outputs.tf                  terraform output values: ssh_command, grafana_tunnel_command, etc.
cloud-init.yaml.tpl          Installs Docker, clones the repo, sets up the nightly backup cron — does NOT start the app
```

## One-time manual setup (before `terraform apply`)

1. OCI compartment + API signing key pair for a user with permissions in it.
2. `oci os ns get` for the Object Storage namespace.
3. Copy `terraform.tfvars.example` → `terraform.tfvars`, fill in every value. **Never commit this file** (gitignored).
4. Optional: remote state backend (S3-compatible, commented out in `versions.tf`).

`terraform apply` is never run automatically by anything in this repo — it's a deliberate, explicit, human step.

## After apply

- `terraform output ssh_command` to reach the VM. Docker is already installed, repo already cloned by cloud-init — the app itself is **not** started; that's the DevOps deploy pipeline's job, or run `docker compose up --build -d` by hand the first time.
- `terraform output grafana_tunnel_command` — Grafana is bound to `127.0.0.1:3000` on the VM only, not publicly exposed.

## DevOps pipeline (`infra/devops-pipelines/`)

Two-stage, deliberately **not auto-chained**: build pipeline (build_spec.yaml) builds/pushes images to OCIR on push to `main`; deploy pipeline (deploy_spec.yaml + before/after_install.sh + validate_service.sh) is triggered separately so there's a manual checkpoint before promoting a build to the running VM.

> [!warning] `order-service` is missing from the CI/CD pipeline
> `build_spec.yaml` only builds and pushes `auth-service`, `content-service`, and `gateway` images (`AUTH_IMAGE`/`CONTENT_IMAGE`/`GATEWAY_IMAGE` in `build.env`) — there is no `order-service` build step, no `ORDER_IMAGE`, and it's absent from the lint step too. `order-service` is the newest service (marketplace/Razorpay/sellers) and was seemingly added after this pipeline was last touched. If OCI deployment is ever pursued, `build_spec.yaml`/`deploy_spec.yaml` need an `order-service` stage added before that path can work end-to-end. See [[Known Gaps]].

Two things are deliberately manual (OCI keeps these out of non-interactive Terraform):
1. **GitHub connection** — Console → DevOps → Connections, PAT-based, OCID pasted into `terraform.tfvars.github_connection_id`.
2. **Deploy-stage secrets** — stored as OCI Vault secrets, wired as Deployment Pipeline Parameters in the Console (not in any file in this repo): `DATABASE_URL`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`, `OCIR_AUTH_TOKEN` (an OCI Auth Token, not the console password), `OCIR_NAMESPACE`/`OCIR_USERNAME`/`OCIR_REGION`, `GIT_REPO_URL`/`GIT_BRANCH`. **Never** put real values in the spec YAML files or shell scripts — those are committed.

## Local dry-run of pipeline steps (before trusting the real pipeline)

```sh
docker build -t auth-service:test ./backend/services/auth-service
docker build -t content-service:test ./backend/services/content-service
docker build -t gateway:test ./backend/gateway
# then, on the VM from /opt/dumbbrew:
bash scripts/before_install.sh   # needs GIT_REPO_URL, GIT_BRANCH
bash scripts/after_install.sh    # needs the Vault-backed secrets above
```

## Migration path from Vercel (current) to here (future)

No frontend code changes needed — `config.js` already points at external Supabase/R2/Razorpay regardless of where the HTML is served from. The gateway's nginx already serves `backend/gateway/public/` as static files identically to how Vercel does. Moving is purely a hosting-location change, once `order-service` is added to the pipeline.
