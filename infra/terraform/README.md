# DumbBrew infrastructure (Terraform / OCI)

Provisions the entire runtime footprint inside OCI's **Always Free** tier:

| Resource | Free tier fit |
|---|---|
| 1x `VM.Standard.A1.Flex` (4 OCPU / 24GB) | Always Free covers up to 4 OCPU + 24GB of Ampere A1 total |
| 1x 100GB boot volume | Always Free covers up to 200GB of block volume |
| VCN + subnet + IGW + security list | Networking is always free |
| 2x Object Storage buckets (media, backups) | Always Free includes 10GB Standard storage |
| IAM dynamic group + policy | Free; used for instance-principal auth (no static keys on the box) |

Everything else — the microservices, Postgres, Prometheus/Grafana/Loki — runs
as Docker containers **on that one VM** via `docker compose` (see
`backend/docker-compose.yml`). This is deliberate: OKE (Kubernetes) or one VM
per service would blow past the free tier for an app this size.

## One-time setup (do this before `terraform apply`)

1. Create/choose an OCI compartment for this project.
2. Generate an API signing key pair for a user with permissions in that
   compartment (`oci setup keys` or the Console: *User Settings → API Keys*).
3. Find your Object Storage namespace: `oci os ns get`.
4. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in every
   value. **Do not commit `terraform.tfvars`** — it's already gitignored.
5. (Optional but recommended) Set up the S3-compatible remote state backend
   commented out in `versions.tf` so state isn't only on your laptop.

## Usage

```sh
terraform init
terraform plan    # review before applying — this creates real, billed-capable resources
terraform apply
```

Nothing here auto-runs `terraform apply` for you — that's a deliberate,
explicit step you run yourself once the plan looks right.

## After apply

- `terraform output ssh_command` — SSH into the VM (cloud-init has already
  installed Docker, cloned the repo, and set up the nightly backup cron; it
  does **not** start the app — that's the DevOps pipeline's job, or run it by
  hand the first time: see `backend/README.md`).
- `terraform output grafana_tunnel_command` — Grafana is only bound to
  `127.0.0.1:3000` on the VM (not exposed publicly); tunnel to it.

## Destroying

`terraform destroy` removes the VM, network, and buckets. Object Storage
buckets must be empty to delete — either let the backup lifecycle policy
expire old objects first or empty them manually.
