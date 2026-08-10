#!/usr/bin/env bash
#
# Daily data fetch, run from a VPS in a Binance-permitted region.
#
# WHY THIS RUNS HERE AND NOT IN CI
# --------------------------------
# Binance answers HTTP 451 to datacenter IP ranges — not merely to US geography.
# GitHub-hosted runners are refused outright, and the block has been reported on
# Google Cloud from Asian regions too, so "pick a non-US region" is not on its
# own a fix. A VPS on a served range is, which is what this box is for.
#
# Everything downstream reads the database only. Vercel never calls the venue,
# so nothing about the web app depends on where it is deployed.
#
# INSTALL
#   git clone git@github.com:claudius-inc/claudius-hq.git
#   cd claudius-hq && npm ci
#   cp .env.example .env    # then fill in the four vars listed below
#   chmod +x scripts/ops/daily-fetch.sh
#
# SCHEDULE (crontab -e). 00:10 UTC, after the 00:00 4h bar closes:
#   10 0 * * * /home/USER/claudius-hq/scripts/ops/daily-fetch.sh >> /home/USER/claudius-hq/fetch.log 2>&1
#
# Required in .env:
#   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN     — where everything is written
#   TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID — omit to skip the push
# Optional:
#   BINANCE_API_BASE — only if relaying; unset means talk to Binance directly,
#                      which is correct on a permitted host.

set -euo pipefail

cd "$(dirname "$0")/../.."

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') daily fetch starting ==="

# Fail fast and loudly if the host cannot reach the venue. Without this the
# pipeline's own error surfaces hundreds of lines later as a generic crash, and
# a 451 here means the box has been moved or its range has been delisted —
# which is a hosting problem, not a code problem.
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  "${BINANCE_API_BASE:-https://fapi.binance.com}/fapi/v1/ping")
if [ "$HTTP" != "200" ]; then
  echo "FATAL: Binance ping returned HTTP $HTTP from this host."
  [ "$HTTP" = "451" ] && echo "       451 means this IP range is not served. Move the box or set BINANCE_API_BASE."
  exit 1
fi
echo "Binance reachable (HTTP 200)"

# The screen: universe -> score -> rank by open interest -> persist picks,
# funnel counts and the candles the page renders. Sends the Telegram push too
# unless the credentials are absent.
npx tsx scripts/pipelines/run-convergence-report.ts

# Underlying daily history for the tradfi names, and the mapping re-verification
# that demotes any contract whose Yahoo ticker has drifted from its index price.
# Cheap and idempotent, so it runs every day rather than on a separate schedule.
npx tsx scripts/backfill/equity-price-history.ts --verify-only

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') daily fetch complete ==="
