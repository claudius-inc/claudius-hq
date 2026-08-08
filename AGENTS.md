# Claudius HQ — Agent Instructions

A markets/research dashboard: Next.js App Router, Turso (libSQL) via Drizzle, deployed on Vercel.

What follows is only what you can't read off the codebase — conventions, decisions, and gotchas. Everything inferrable from the file tree is deliberately omitted.

## Don't run `next build` during development

The dev server is usually running and a build interrupts it. Check with `npx tsc --noEmit` and `npx eslint` instead.

## Logging

Server-side code (API routes, `src/lib`, middleware) uses `logger` from `@/lib/logger`. Never raw `console.log` / `warn` / `error` — the logger emits structured JSON that Vercel's log viewer parses and filters natively.

```ts
logger.error("api/macro", "Failed to fetch macro data", { error: e });
```

`source` is the module name or route path (`"api/macro"`, `"market-cache"`). Error objects go in `{ error: e }` and are auto-serialized to `{ name, message, stack }`.

## ISR & revalidation

| Data source | `export const revalidate` |
| --- | --- |
| External APIs (Yahoo Finance, etc.) | 60–300s — balances freshness against rate limits |
| DB data with external enrichment | 60–120s — tracks market-data staleness |
| Internal DB-only data | **none** — use on-demand revalidation |

For DB-only data, call `revalidatePath()` from the API route *after* the write succeeds (never from a client component), for every path that displays the changed data:

| Data changed | Invalidate |
| --- | --- |
| Projects | `/projects`, `/projects/[id]`, `/` |
| Ideas | `/projects/ideas` |
| Themes / theme stocks | `/markets/scanner/themes` |
| Research reports | `/markets/research`, `/markets/research/[ticker]` |
| Scanner results | `/markets/scanner` |
| Portfolio | `/portfolio` |

Don't over-invalidate — map the dependency before adding a path.

## Loading skeletons

Every async UI section reserves a stable outer height before data arrives. Layout shift is unacceptable.

- The skeleton mirrors the loaded structure 1:1 — same wrappers, paddings, headers, row count, DOM types.
- Skeleton row count comes from the **same constant** the loaded state uses, never a hand-picked number.
- A per-row inline skeleton renders a placeholder for every element the loaded row renders.
- For genuinely variable-length lists, pad to the max expected count and put `min-h` on the container — on both branches or neither.

Reference implementation: `src/app/markets/_components/GavekalQuadrant.tsx`.

## Production debugging

Read the Vercel runtime logs before theorising (`vercel logs --follow`, or the dashboard). Recurring causes:

- 307 redirects on static files → middleware matcher too broad
- "Unauthorized API request" → auth middleware, not a missing env var
- Empty data → cache, upstream API failure, *or* auth

## Component placement

Page-specific components live beside the page that uses them. `_components/` holds `.tsx` only; types, constants, and helpers go in a sibling `_lib/` and are imported relatively.

Promote to `src/components/` only at 3+ consumers, or for genuine UI primitives (`src/components/ui/`).

## UI conventions

- Page heroes use `PageHero` from `@/components/PageHero`. Titles are clean text — no icons before them.
- ACP pillars are exactly `quality`, `replace`, `build`, `experiment`, `distribute`. Render them with `AcpPillarBadge`.

## Scripts

`scripts/` is for tooling that gets reused, filed under `seed/`, `backfill/`, `pipelines/`, `portfolio/`, or `ops/` — no loose files at the top level. One-shots are deleted once they've run; the canonical record is git history plus the resulting state in the DB and `drizzle/`.

Full rules, including what doesn't belong in `scripts/` and how renames propagate: `.claude/skills/scripts-discipline/SKILL.md`.
