#!/bin/bash
# Daily HQ database backup.
# Dumps Turso DB → age-encrypted SQL into workspace/backups/.
# The workspace-backup cron (00:00 UTC) commits + pushes it to the
# openclaw-workspace repo, so old snapshots are recoverable via git log.
# Runs daily at 23:30 UTC via cron.

set -euo pipefail

# Secrets (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN) live in openclaw credentials.
. /root/.openclaw/workspace/.credentials/claudius-hq.env
export TURSO_DATABASE_URL TURSO_AUTH_TOKEN

PROJECT_DIR=/root/.openclaw/workspace/projects/claudius-hq
DEST_DIR=/root/.openclaw/workspace/backups
DEST=$DEST_DIR/hq-db-backup.sql

cd "$PROJECT_DIR"
mkdir -p "$DEST_DIR"

echo "[$(date -u)] Starting backup..."
NODE_OPTIONS="--max-old-space-size=256" node scripts/ops/dump-db.mjs "$DEST"

SIZE=$(du -h "$DEST" | cut -f1)
echo "[$(date -u)] Backup written to $DEST ($SIZE)."
