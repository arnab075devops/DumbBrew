#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-v2
  - git
  - unzip
  - python3-pip

write_files:
  - path: /etc/dumbbrew/backup.env
    permissions: "0600"
    content: |
      OCI_NAMESPACE=${object_storage_namespace}
      OCI_BUCKET_NAME=${backup_bucket_name}

runcmd:
  # Docker
  - systemctl enable --now docker
  - usermod -aG docker ubuntu

  # OCI CLI (for the backup cron job; uses instance-principal auth, no static keys)
  - pip3 install oci-cli

  # App checkout
  - mkdir -p /opt/dumbbrew
  - git clone --branch ${git_branch} --depth 1 ${git_repo_url} /opt/dumbbrew-src
  - cp -r /opt/dumbbrew-src/backend/. /opt/dumbbrew
  - chown -R ubuntu:ubuntu /opt/dumbbrew

  # Firewall: only 22/80/443 (matches the OCI security list; this is
  # belt-and-suspenders in case ufw is enabled later).
  - ufw allow 22/tcp || true
  - ufw allow 80/tcp || true
  - ufw allow 443/tcp || true

  # Daily DB backup to Object Storage at 03:15 UTC, low-traffic window.
  - cp /opt/dumbbrew/db/backup/backup-to-object-storage.sh /usr/local/bin/dumbbrew-backup.sh
  - chmod +x /usr/local/bin/dumbbrew-backup.sh
  - |
    cat <<'CRON' > /etc/cron.d/dumbbrew-backup
    15 3 * * * root . /etc/dumbbrew/backup.env && . /opt/dumbbrew/.env && export DATABASE_URL OCI_NAMESPACE OCI_BUCKET_NAME && /usr/local/bin/dumbbrew-backup.sh >> /var/log/dumbbrew-backup.log 2>&1
    CRON

  # NOTE: the actual `docker compose up -d` first run is intentionally left to
  # the OCI DevOps deploy pipeline (see infra/devops-pipelines/deploy_spec.yaml),
  # which also writes /opt/dumbbrew/.env from the DevOps secret vault before
  # starting the stack. Cloud-init only prepares the host.
