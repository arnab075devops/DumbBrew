#!/usr/bin/env sh
# Dumps the shared Postgres DB and uploads it to the OCI Object Storage bucket
# created by Terraform. Intended to run as a daily cron job on the VM (see
# infra/terraform/cloud-init.yaml.tpl) — not inside docker-compose, since the
# OCI CLI needs the instance's resource-principal / config auth, not a
# container's.
#
# Requires: pg_dump, oci CLI (both installed by cloud-init), and the env vars
# below set in /etc/dumbbrew/backup.env.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${OCI_BUCKET_NAME:?OCI_BUCKET_NAME is required}"
: "${OCI_NAMESPACE:?OCI_NAMESPACE is required}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=$(mktemp -d)
OUT_FILE="$OUT_DIR/dumbbrew-db-$STAMP.sql.gz"

pg_dump "$DATABASE_URL" | gzip -9 > "$OUT_FILE"

oci os object put \
  --namespace "$OCI_NAMESPACE" \
  --bucket-name "$OCI_BUCKET_NAME" \
  --file "$OUT_FILE" \
  --name "db-backups/dumbbrew-db-$STAMP.sql.gz" \
  --no-multipart

rm -rf "$OUT_DIR"
echo "Backup uploaded: db-backups/dumbbrew-db-$STAMP.sql.gz"
