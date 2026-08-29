#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/dumbbrew

# Always deploy from a fresh shallow clone rather than `git pull` in place —
# simpler, no merge/conflict states to reason about on a small prod box.
# .env (containing the real DB/JWT secrets) is preserved: it is never part
# of the git repo, so rsync --delete never touches it because it isn't in
# the exclude-cleared destination tree to begin with... to be explicit we
# also pass --exclude=.env below.
rm -rf /tmp/dumbbrew-deploy-src
git clone --branch "${GIT_BRANCH:-main}" --depth 1 "${GIT_REPO_URL}" /tmp/dumbbrew-deploy-src

rsync -a --delete \
  --exclude ".env" \
  --exclude ".git" \
  /tmp/dumbbrew-deploy-src/backend/ /opt/dumbbrew/

rm -rf /tmp/dumbbrew-deploy-src
