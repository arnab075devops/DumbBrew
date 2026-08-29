# Runbook

## Checking service health

```sh
ssh ubuntu@<vm-ip>
curl http://127.0.0.1/healthz                 # gateway
docker compose -f /opt/dumbbrew/docker-compose.yml ps
docker compose -f /opt/dumbbrew/docker-compose.yml logs -f auth-service
```

Or remotely via Grafana (tunnel first: `terraform output grafana_tunnel_command`)
→ "DumbBrew Backend Overview" dashboard, or Explore → Loki for logs.

## A deploy failed `validate_service.sh`

The DevOps deploy pipeline does not auto-rollback (rolling deploys of a
single instance have nothing to roll onto). To recover by hand:

```sh
ssh ubuntu@<vm-ip>
cd /opt/dumbbrew
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 auth-service content-service gateway
# Fix forward (redeploy a good commit) or, to pin back to a known-good image tag:
AUTH_IMAGE=<previous tag> CONTENT_IMAGE=<previous tag> GATEWAY_IMAGE=<previous tag> \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Previous image tags are visible in OCIR (Console → Developer Services →
Container Registry) or `docker images`.

## Restoring a DB backup

```sh
oci os object list --namespace <ns> --bucket-name dumbbrew-db-backups --prefix db-backups/
oci os object get --namespace <ns> --bucket-name dumbbrew-db-backups \
  --name db-backups/dumbbrew-db-<timestamp>.sql.gz --file restore.sql.gz
gunzip restore.sql.gz
psql "$DATABASE_URL" < restore.sql
```

## Rotating the admin password

```sh
ssh ubuntu@<vm-ip>
cd /opt/dumbbrew
docker compose exec auth-service sh -c \
  "ADMIN_EMAIL=owner@dumbbrew.example ADMIN_PASSWORD=<new password> npm run seed:admin"
```

This immediately invalidates nothing already-issued — old access tokens
remain valid until they expire (≤15 min). To force logout everywhere,
revoke all refresh tokens: `DELETE FROM auth.refresh_tokens WHERE admin_id = '<id>';`

## Rotating JWT_SECRET

Invalidates every outstanding access and refresh token immediately (all
admins must log in again). Update the secret in Vault / deploy-pipeline
parameters, redeploy both `auth-service` and `content-service` together
(they must agree on the same secret at all times).

## High CPU/memory alert

Check Grafana's host CPU/mem panels and the per-container CPU panel to
identify which container. `docker stats` on the VM for a live view. Given
the Always Free VM's fixed 4 OCPU/24GB ceiling, sustained high usage means
either a real traffic increase (plan a resize/second instance) or a bug
(check Loki logs for the offending service first).
