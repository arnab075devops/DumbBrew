#!/usr/bin/env bash
set -euo pipefail

cd /opt/dumbbrew
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

# Prune old, now-unused images so the boot volume doesn't fill up over
# repeated deploys (cost-optimization: keeps disk usage flat without a
# bigger, non-free boot volume).
docker image prune -af --filter "until=72h"
