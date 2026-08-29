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
#   git clone https://github.com/claudius-inc/claudius-hq.git
#   cd claudius-hq && npm ci
#   cp .env.example .env    # then fill in the two vars listed below
#
# Do NOT chmod this file. Its executable bit is tracked in the repository, and a
# local mode change makes the worktree permanently dirty — see the sync block.
#
# SCHEDULE (crontab -e). 00:10 UTC, after the 00:00 4h bar closes:
#   10 0 * * * /home/USER/claudius-hq/scripts/ops/daily-fetch.sh >> /home/USER/claudius-hq/fetch.log 2>&1
#
# Required in .env:
#   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN — where everything is written.
#   These two are the ONLY credentials this box should hold. No Telegram token:
#   see the --record-only note below.
# Optional:
#   BINANCE_API_BASE — only if relaying; unset means talk to Binance directly,
#                      which is correct on a permitted host.

# -E so the ERR trap below is inherited by the function the body lives in.
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

# NAME THE FAILING LINE.
#
# Every step here aborts the whole script under `set -e`, and the box has no
# other alarm — the only signal downstream is the sender's staleness message
# ~15 minutes later, which knows that nothing arrived but nothing about why.
# One line in fetch.log turns that into a diagnosis.
trap 'rc=$?; echo "FATAL: daily-fetch.sh failed at line ${LINENO} (exit ${rc})"' ERR

# WHY THE BODY IS A FUNCTION
# --------------------------
# The sync below replaces THIS FILE while bash is still executing it. Bash reads
# a script incrementally, by byte offset, so any commit that changes the length
# of anything above the current offset makes it resume mid-token in the new
# text — a syntax error at best, a different command at worst.
#
# Wrapping the body in a function forces bash to parse the whole file before it
# runs a single line of it, so the run in flight is the version it started as.
main() {
  echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') daily fetch starting ==="

  # Fail fast and loudly if the host cannot reach the venue. Without this the
  # pipeline's own error surfaces hundreds of lines later as a generic crash, and
  # a 451 here means the box has been moved or its range has been delisted —
  # which is a hosting problem, not a code problem.
  local http
  http=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    "${BINANCE_API_BASE:-https://fapi.binance.com}/fapi/v1/ping")
  if [ "$http" != "200" ]; then
    echo "FATAL: Binance ping returned HTTP $http from this host."
    [ "$http" = "451" ] && echo "       451 means this IP range is not served. Move the box or set BINANCE_API_BASE."
    exit 1
  fi
  echo "Binance reachable (HTTP 200)"

  # Track main before running.
  #
  # WITHOUT THIS THE BOX SILENTLY ROTS. The clone was made once at install and
  # nothing ever moved it, so this script kept running a months-old screen against
  # a current schema: every ranking column added on 2026-08-12 (`rev6`, `rvol`,
  # `funding_abs`, `combo_gated`) was written NULL for weeks, the send rendered an
  # empty line where the ranking reason belonged, and nothing failed — the rows
  # were there, the counts looked normal, only the values were missing. A frozen
  # checkout is the failure mode that looks most like health.
  #
  # `--ff-only` so a dirty box refuses to run rather than silently merging. That
  # cuts both ways: a fast-forward is a checkout, and checkout will not clobber a
  # locally-modified file, so ANY stray edit on the box aborts the fetch on the
  # day a commit first touches that file. Report the state rather than let the
  # merge's own message be the only clue.
  # `--untracked-files=no` deliberately. Only a TRACKED modification can block a
  # checkout; untracked files cannot, and this box writes fetch.log into the repo
  # root, so counting them would abort every run from the second day onward.
  git fetch --quiet origin main
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "FATAL: the worktree is dirty, so --ff-only cannot check out origin/main."
    git status --short --untracked-files=no
    echo "       Reset the box with: git reset --hard origin/main"
    echo "       Do not chmod tracked files — the mode bit is what usually does this."
    exit 1
  fi
  git merge --ff-only origin/main
  npm ci --silent
  echo "Checkout at $(git rev-parse --short HEAD)"

  # The screen: universe -> score -> rank by open interest -> persist picks,
  # funnel counts and the candles the page renders.
  #
  # --record-only ON PURPOSE. This box exists to reach Binance, which is a
  # capability no other host has. Sending Telegram is NOT such a capability — it
  # works from anywhere with network access — so putting it here would import a
  # bot credential onto the box for no gain. The token is not write-only: the bot
  # handles inbound commands, so it also permits reading the bot's messages and
  # acting as it. It stays where it already lives.
  npx tsx scripts/pipelines/run-convergence-report.ts --record-only

  # Forward-return labels for the perp picks recorded above and on earlier days.
  #
  # This runs HERE, not in the CI label-picks job, for the same reason the screen
  # does: it needs Binance klines, and CI is 451'd. Momentum and crypto picks are
  # still labelled in CI, where Yahoo and CoinGecko are reachable. A failure here
  # must not cost the fetch — the picks are already recorded, and a label is
  # re-attempted every day it stays pending — so it is allowed to fail soft.
  npx tsx scripts/pipelines/run-label-perps.ts || echo "WARN: perp labelling failed; picks are recorded, labels retry tomorrow"

  # Underlying daily history for the tradfi names, and the mapping re-verification
  # that demotes any contract whose Yahoo ticker has drifted from its index price.
  # Cheap and idempotent, so it runs every day rather than on a separate schedule.
  npx tsx scripts/backfill/equity-price-history.ts --verify-only

  echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') daily fetch complete ==="
}

main "$@"
