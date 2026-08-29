# OCI DevOps CI/CD

`../terraform/devops.tf` creates the DevOps project, OCIR container
repositories, build pipeline (+ stage referencing `build_spec.yaml`), and
deploy pipeline (+ environment pointed at the app VM, + stage referencing
`deploy_spec.yaml`) via Terraform. Two things are deliberately left manual —
both are one-time, credential-adjacent actions OCI itself keeps out of
non-interactive Terraform:

## 1. GitHub connection

Console → Developer Services → DevOps → Connections → Create Connection
(GitHub, personal access token with repo scope). Copy its OCID into
`github_connection_id` in `terraform.tfvars`, then `terraform apply` again
so the build stage's source is wired up.

## 2. Deploy-stage secrets (Vault)

The deploy hooks (`scripts/after_install.sh`) need these as environment
variables at deploy time — store them as OCI Vault secrets and reference
them as Deployment Pipeline **Parameters** in the Console (Deploy Pipeline →
Parameters → add each as a Vault-secret-backed parameter):

| Parameter | Source |
|---|---|
| `DATABASE_URL` | Vault secret |
| `JWT_SECRET` | Vault secret |
| `POSTGRES_PASSWORD` | Vault secret |
| `GRAFANA_ADMIN_PASSWORD` | Vault secret |
| `OCIR_AUTH_TOKEN` | Vault secret — an OCI Auth Token for the DevOps user, not their console password |
| `OCIR_NAMESPACE`, `OCIR_USERNAME`, `OCIR_REGION` | Plain parameters |
| `GIT_REPO_URL`, `GIT_BRANCH` | Plain parameters |

Never put real values in `build_spec.yaml`/`deploy_spec.yaml`/scripts —
those live in the git repo. Parameters are the only place secrets belong.

## Triggering

Once the GitHub connection exists, add a trigger on the build pipeline
(Console → Build Pipeline → Triggers → "Push to branch: main") so every
merge to `main` builds, pushes to OCIR, and — if you also wire the deploy
pipeline as the build pipeline's next stage, or trigger it manually/via a
second automation — deploys. Keeping build and deploy as two distinct
pipelines (rather than auto-chaining) is intentional for a v1: you get to
`terraform output ssh_command` in and eyeball things before promoting a
build to the running VM.

## Local dry-run of the pipeline steps

Before trusting the pipeline, you can run the same steps by hand:

```sh
# what build_spec.yaml does
docker build -t auth-service:test ./backend/services/auth-service
docker build -t content-service:test ./backend/services/content-service
docker build -t gateway:test ./backend/gateway

# what deploy_spec.yaml's hooks do, run from /opt/dumbbrew on the VM
bash scripts/before_install.sh   # needs GIT_REPO_URL, GIT_BRANCH
bash scripts/after_install.sh    # needs the secrets table above
bash scripts/start_application.sh
bash scripts/validate_service.sh
```
