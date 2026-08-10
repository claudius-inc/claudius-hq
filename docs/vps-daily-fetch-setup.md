# VPS setup — daily market data fetch

Instructions for an agent setting up the daily fetcher on a VPS.

## What you are building and why

This box is the **only** component allowed to talk to Binance. It runs a screen
over ~680 perpetual futures once a day, writes everything to a Turso database,
and sends a Telegram summary. The Next.js app on Vercel reads that database and
never calls the venue.

That split is not a preference. Binance answers `HTTP 451 — Service unavailable
from a restricted location` to **datacenter IP ranges**, not merely to US
geography. GitHub-hosted runners are refused outright, and the block has been
reported on Google Cloud from Asian regions too. This VPS is in Germany, which
is served — that is the entire reason it exists.

**Therefore: never move a Binance call into the web app, and never re-add the
schedule to `.github/workflows/convergence-report.yml`.** The reason is recorded
in that file.

## Prerequisites

- Node.js 20 or newer (`node -v`). The repo's CI pins 20.
- `git`, `curl`
- Outbound HTTPS

## Step 0 — Verify the venue serves this host (do this FIRST)

Nothing else matters if this fails.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fapi.binance.com/fapi/v1/ping
```

- `200` → proceed.
- `451` → **stop.** This IP range is not served. Do not attempt workarounds,
  do not install a VPN without asking. Report the code back and stop.
- Anything else → network or DNS problem on the host; resolve before continuing.

## Step 1 — Clone and install

```bash
cd ~
git clone https://github.com/claudius-inc/claudius-hq.git
cd claudius-hq
npm ci
```

Use `npm ci`, not `npm install` — it installs exactly the lockfile and will not
silently upgrade anything.

## Step 2 — Configure secrets

Create `.env` in the repo root. **Ask the operator for these values; do not
invent them and do not commit this file** (it is gitignored):

```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ADMIN_CHAT_ID=...
```

`chmod 600 .env`

Notes:
- The two Turso vars are required. Without them the pipeline exits immediately.
- The two Telegram vars are optional — omit them and the run still does all its
  database work, just without sending a message. Useful for a first test.
- `BINANCE_API_BASE` should stay **unset**. It exists only for relaying through
  another host, which this box does not need.

## Step 3 — First run, by hand

```bash
chmod +x scripts/ops/daily-fetch.sh
./scripts/ops/daily-fetch.sh
```

Expect roughly **2–4 minutes**. The script pings Binance first and aborts loudly
on any non-200, so a hosting problem surfaces on line one rather than as a
generic crash later.

A healthy run ends with `daily fetch complete` and logs a line containing
`"Chart bars recorded"` with `"symbols":16`.

If you want to exercise the database path without sending a Telegram message:

```bash
npx tsx scripts/pipelines/run-convergence-report.ts --record-only
```

## Step 4 — Confirm the data landed

```bash
npx tsx -e '
import("dotenv/config").then(async () => {
  const { rawClient } = await import("./src/db/index.ts");
  const r = await rawClient.execute(`
    SELECT run_date, COUNT(*) AS candidates, SUM(reported) AS sent
    FROM perp_convergence_picks GROUP BY run_date ORDER BY run_date DESC LIMIT 3`);
  console.table(r.rows);
});'
```

Expect a row for today with ~60–150 candidates and exactly 16 sent. If
`candidates` is 0, the screen ran but nothing cleared the threshold — check the
funnel counts in the log before assuming a fault.

## Step 5 — Schedule it

The screen reads 4-hour bars that close at 00:00/04:00/08:00… UTC, and it
discards the still-forming bar. Running at **00:10 UTC** means the most recent
complete bar is fresh.

**Confirm the host's clock is UTC first** — cron uses system local time, so a
box set to Europe/Berlin would fire at the wrong moment:

```bash
timedatectl                      # check
sudo timedatectl set-timezone UTC   # if it is not UTC
```

Then `crontab -e` and add (replace `USER`):

```
10 0 * * * /home/USER/claudius-hq/scripts/ops/daily-fetch.sh >> /home/USER/claudius-hq/fetch.log 2>&1
```

Every day, including weekends — crypto perps trade continuously, and Binance's
tradfi perps keep trading while their cash markets are shut.

Add log rotation so the file cannot grow without bound. `/etc/logrotate.d/claudius`:

```
/home/USER/claudius-hq/fetch.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
```

## Step 6 — Keeping the code current

The pipeline changes as the screen is tuned. To update:

```bash
cd ~/claudius-hq && git pull && npm ci
```

**Check `drizzle/` for new migration files after every pull.** They are not
applied automatically. If a new numbered `.sql` appears and the next run fails
with "no such column", that migration has not been applied — report it rather
than guessing, since it is applied against the shared production database.

## Troubleshooting

| Symptom | Cause and action |
|---|---|
| `HTTP 451` from the ping | IP range no longer served. Stop and report. |
| `URL_INVALID: The URL 'undefined'` | `TURSO_DATABASE_URL` missing from `.env`. |
| `Telegram credentials missing` (warning) | Expected if you omitted them; DB work still completed. |
| `no such column` / `no such table` | An unapplied migration in `drizzle/`. Report it. |
| Run takes >10 min | Venue rate limiting. Check for `429`/`418` in the log; the client backs off on its own. |
| Cron never fires | Check `timedatectl` is UTC, that the script is executable, and that the crontab path is absolute. |

## Things to avoid

- Do **not** run `npm run build` / `next build` here. This box runs scripts only;
  the web app builds on Vercel.
- Do **not** commit `.env` or any credential.
- Do **not** add Binance calls to the Next.js app.
- Do **not** run the pipeline more than once a day without reason. A same-day
  re-run replaces that day's rows, and the repeat-suppression window means the
  second run selects a *different* set of names.
