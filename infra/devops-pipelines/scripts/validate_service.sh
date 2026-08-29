#!/usr/bin/env bash
set -euo pipefail

for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1/healthz >/dev/null; then
    echo "gateway healthy"
    exit 0
  fi
  sleep 3
done

echo "gateway failed health check after deploy — rolling back is manual: see docs/RUNBOOK.md" >&2
exit 1
