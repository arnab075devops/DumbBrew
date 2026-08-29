#!/usr/bin/env bash
set -euo pipefail

# AUTH_IMAGE / CONTENT_IMAGE / GATEWAY_IMAGE come from the build stage's
# exportedVariables (build_spec.yaml). The secret values below come from
# deployment pipeline parameters backed by OCI Vault secrets — configure
# those in the deploy stage, never hardcode them here.
: "${AUTH_IMAGE:?}" "${CONTENT_IMAGE:?}" "${GATEWAY_IMAGE:?}"
: "${DATABASE_URL:?}" "${JWT_SECRET:?}" "${POSTGRES_PASSWORD:?}" "${GRAFANA_ADMIN_PASSWORD:?}"

cat > /opt/dumbbrew/.env <<EOF
POSTGRES_USER=dumbbrew
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dumbbrew
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
JWT_ISSUER=dumbbrew-auth
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
CORS_ORIGIN=${CORS_ORIGIN:-*}
NODE_ENV=production
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
AUTH_IMAGE=${AUTH_IMAGE}
CONTENT_IMAGE=${CONTENT_IMAGE}
GATEWAY_IMAGE=${GATEWAY_IMAGE}
EOF
chmod 600 /opt/dumbbrew/.env

# OCIR auth for the pull below. OCIR_AUTH_TOKEN is a deploy-stage parameter
# sourced from Vault (an OCI Auth Token, not the tenancy password).
echo "${OCIR_AUTH_TOKEN}" | docker login "${OCIR_REGION:-iad.ocir.io}" -u "${OCIR_NAMESPACE}/${OCIR_USERNAME}" --password-stdin

cd /opt/dumbbrew
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
