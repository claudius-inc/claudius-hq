#!/bin/bash
# Daily HQ database backup
# Dumps to SQL, pushes to private GitHub repo
# Runs daily at 03:00 UTC via cron

set -e

cd /root/.openclaw/workspace/projects/claudius-hq

export TURSO_DATABASE_URL="libsql://claudius-hq-manapixels.aws-ap-northeast-1.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Njk5MDQxMjMsImlkIjoiZGQ1ZTcxODMtODM0Mi00NmZhLTk5YTItN2U3OWRmZjJjYjM0IiwicmlkIjoiMGEyZTM1YmYtMDJiZi00ZmYzLTkzNDktYzk0OTgzMDI1OTkzIn0.ztrDyGsVoUGyoBzlng_EbAIAKF_oYuW76pZf8uKOykjSXr5mm7qPHMI0-vGRSmvPR67aDPoomzX4__XRsdBCDA"

REPO_DIR="/root/.openclaw/workspace/backups/hq-db-backups"
DATE=$(date -u +%Y-%m-%d)
FILE="hq-${DATE}.sql"

# Ensure dir exists
mkdir -p "$REPO_DIR"

# Run the dump directly into the repo (excludes large regeneratable tables)
echo "[$(date -u)] Starting backup..."
NODE_OPTIONS="--max-old-space-size=256" node scripts/ops/dump-db.mjs "$REPO_DIR/$FILE"

SIZE=$(du -h "$REPO_DIR/$FILE" | cut -f1)
echo "[$(date -u)] Dump complete: $FILE ($SIZE)"

cd "$REPO_DIR"

if [ ! -d ".git" ]; then
  echo "[$(date -u)] Initializing git repo..."
  git init
  git remote add origin git@github.com:claudius-inc/hq-db-backups.git 2>/dev/null || true
fi

git add "$FILE"
git commit -m "backup: $DATE" || true
git branch -M main 2>/dev/null; git push origin main 2>&1

# Clean up backups older than 30 days
find "$REPO_DIR" -name "hq-*.sql" -mtime +30 -delete

echo "[$(date -u)] Backup pushed to GitHub."
