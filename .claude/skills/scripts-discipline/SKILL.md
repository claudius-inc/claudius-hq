---
name: scripts-discipline
description: Rules for adding, naming, moving, or removing files under `scripts/` in Claudius HQ. Use when creating a script, deciding where a script belongs, cleaning up one-shot scripts, or renaming/moving anything in `scripts/`.
---

# Scripts folder discipline

`scripts/` is for tooling that gets re-used. One-shots get deleted after they run; the canonical record is the git history and the resulting state in the database / `drizzle/` folder.

## Folder layout

Every file under `scripts/` lives in exactly one of these subdirectories. No loose files at the top level.

| Folder | Purpose | Examples |
| ------ | ------- | -------- |
| `seed/` | Idempotent seeders for reference data | themes, analysts, market reference |
| `backfill/` | Reusable batch-processing utilities (a workflow, not a one-shot row update) | profile generation, batch preparation/ingestion |
| `pipelines/` | Long-running or scheduled jobs (GH Actions, cron, operator-invoked daemons) | scanners, research-job processors, social fetchers |
| `portfolio/` | Portfolio export / accounting tools | populated portfolio Excel exports |
| `ops/` | Operational maintenance | cache clears, DB backups, build hooks |

## What doesn't belong in `scripts/`

- **Migration apply/verify scripts for a single numbered migration.** The canonical artifact is the SQL file in `drizzle/`. If you wrote `apply-migration-NNNN.ts` to push a SQL file once, delete it after the migration is applied. Same for `verify-migration-NNNN.ts`.
- **"Numbered batch" backfills** (`backfill-batchN.ts`). If the work is genuinely batched, write one parameterised script in `backfill/` that takes the batch as input.
- **One-shot fix / dedupe / purge / inspect probes.** Run them, verify, then delete in the same PR. If you think you'll need it again, generalise it into `ops/` or `backfill/` first — don't leave the narrow probe behind.

## Naming

Drop the redundant prefix once the folder communicates the intent.

- `seed/themes.ts` — not `seed/seed-themes.ts`
- `backfill/ticker-profiles.ts` — not `backfill/backfill-ticker-profiles.ts`
- `ops/clear-cache.ts` — not `ops/ops-clear-cache.ts`

## One source format per script

Don't keep both `.mjs` and `.ts` versions of the same script. Prefer `.ts` for type safety. If you need to convert an existing `.mjs`, replace it — don't duplicate it.

## External references must be updated atomically

Any script invoked by `package.json`, `.github/workflows/`, application code (subprocess), or cron must have those references updated in the same commit as a rename or move. Integration points to check before moving a script:

- `package.json` `scripts` block (`postbuild`, etc.)
- `.github/workflows/*.yml` `run:` lines
- Application code calling `path.join(process.cwd(), "scripts", ...)` (grep for `"scripts"` in `src/`)
- Cron entries documented in script headers (e.g. `process-research-jobs-prod.ts`)
