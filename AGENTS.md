# Claudius HQ — Agent Instructions

## 1. Development Workflow

### Git Commit & Push Policy

**Every commit MUST be followed by a push.** Never leave unpushed commits.

After completing work on a task:

1. Stage and commit your changes
2. **Immediately run `git push origin <branch>`** after the commit succeeds
3. **Verify the push succeeded** by checking the command output for errors
4. If the push fails (auth, network, conflict), report it as a blocker — do NOT silently move on

**Git identity:** All commits MUST use the `manapixels` identity. Before your first commit, verify:

```bash
git config user.name   # must be: manapixels
git config user.email  # must be: 15624933+manapixels@users.noreply.github.com
```

If either is wrong, set them at the repo level:

```bash
git config user.name "manapixels"
git config user.email "15624933+manapixels@users.noreply.github.com"
```

**Correct pattern — always push after commit:**
```bash
git add <files>
git commit -m "feat: description"
git push origin main   # REQUIRED — never skip this step
```

**Never report work as "done" or "pushed" without confirming `git push` output shows success.**

**Auto-push hook:** A `post-commit` git hook is installed that automatically pushes to origin after every commit. This is the safety net — agents should still verify the push output succeeds and report failures as blockers.

### Logging Convention

**Never use raw `console.error`, `console.warn`, or `console.log` in server-side code** (API routes, lib files, middleware).

Use the structured logger from `@/lib/logger`:

```ts
import { logger } from "@/lib/logger";

// Errors (always include { error: e } for stack traces)
logger.error("api/macro", "Failed to fetch macro data", { error: e });

// Warnings
logger.warn("fetch-macro-data", "FRED_API_KEY not set");

// Info
logger.info("api/stocks/research", "Research queued", { ticker, jobId });
```

- `source` should be the module name or API route path (e.g. `"api/macro"`, `"market-cache"`)
- Error objects go in `{ error: e }` — they are auto-serialized to `{ name, message, stack }`
- Output is structured JSON, parsed natively by Vercel's log viewer

### Debugging Production Issues

**Always check Vercel logs FIRST before guessing causes.**

When investigating production issues:

1. Check Vercel Runtime Logs: `vercel logs --follow` or dashboard
2. Look for actual error messages, not symptoms
3. Don't assume missing env vars — verify in Vercel dashboard
4. Check middleware logs for auth/redirect issues

Common pitfalls:
- 307 redirects on static files = middleware matcher too broad
- "Unauthorized API request" = check auth middleware, not env vars
- Empty data = could be cache, API failure, OR auth — check logs first

---

## 2. Performance & Caching

### ISR & Revalidation Strategy

HQ uses Next.js **ISR (Incremental Static Regeneration)** for pages that fetch data.

**Time-based revalidation** (`export const revalidate = N`):

| Data Source                         | Revalidate Time          | Rationale                             |
| ----------------------------------- | ------------------------ | ------------------------------------- |
| External APIs (Yahoo Finance, etc.) | 60-300s                  | Balance freshness vs. API rate limits |
| DB data with external enrichment    | 60-120s                  | Reflects market data staleness        |
| Internal DB-only data               | **Don't use time-based** | Use on-demand revalidation instead    |

```ts
// page.tsx with external data
export const revalidate = 60; // Re-fetch every 60 seconds

// page.tsx with DB-only data
// NO revalidate export — use on-demand revalidation
```

### On-Demand Revalidation

For data that changes via user actions or background jobs, use `revalidatePath()` immediately after DB writes.

```ts
import { revalidatePath } from "next/cache";

// After successful DB mutation
await db.insert(projects).values(newProject);
revalidatePath("/projects");
revalidatePath(`/projects/${newProject.id}`);
revalidatePath("/"); // Homepage shows recent projects
```

**Key rules:**
1. Call `revalidatePath()` AFTER the DB write succeeds (not before)
2. Call from API routes, not from client components
3. Revalidate all paths that display the changed data

**Invalidation Mapping:**

| Data Changed     | Invalidate Paths                                  |
| ---------------- | ------------------------------------------------- |
| Projects         | `/projects`, `/projects/[id]`, `/`                |
| Ideas            | `/projects/ideas`                                 |
| Themes           | `/markets/scanner/themes`                         |
| Theme Stocks     | `/markets/scanner.themes`                         |
| Research Reports | `/markets/research`, `/markets/research/[ticker]` |
| Scanner Results  | `/markets/scanner`                                |
| Portfolio        | `/portfolio`                                      |

### Loading Skeletons & CLS Prevention

**Every async UI section MUST reserve a stable outer height before data arrives.** Layout shift is unacceptable.

**Rules:**
1. **Skeleton mirrors loaded structure 1:1** — same wrappers, paddings, headers, row count, DOM types
2. **Skeleton row count is driven by the SAME constant** the loaded state uses (not hand-picked numbers)
3. **Per-row inline skeletons must render a placeholder for every loaded element**
4. **For truly variable-length lists**, pad skeleton to max expected count with container `min-h`

**Reference:** `src/app/markets/_components/GavekalQuadrant.tsx` — skeleton block mirrors header + grid + table exactly.

**Anti-patterns:**
- Hard-coding skeleton row counts that don't match loaded data
- Wrapping skeleton in different card shape than loaded state
- Single inline skeleton when loaded row has 3+ elements
- Omitting header/title bar from skeleton
- Adding `min-h` only to loading branch (or only to loaded branch)
- Adding `min-h` "just in case" when skeleton already matches loaded shape exactly

---

## 3. Code Organization

### Component Colocation Principle

**Page-specific components live next to the pages that use them**, not in a shared folder.

**Folder Structure:**
```
src/
├── app/
│   ├── markets/
│   │   ├── portfolio/
│   │   │   ├── page.tsx
│   │   │   ├── _components/        # Portfolio-specific components (.tsx only)
│   │   │   │   ├── PortfolioTab.tsx
│   │   │   │   └── ClarityJournal.tsx
│   │   ├── _lib/                   # Section-specific utilities (.ts files)
│   │   │   ├── constants.ts
│   │   │   ├── helpers.ts
│   │   │   └── types.ts
│   │   ├── research/
│   │   │   └── [ticker]/
│   │   │       └── _components/    # Research-specific components
│   │   └── scanner/
│   │       └── sectors/
│   │           ├── _components/
│   │           └── _lib/
│   │               ├── global-markets/
│   │               └── sectors/
│   ├── projects/
│   │   ├── _components/            # Projects list components
│   │   └── [id]/
│   │       └── _components/        # Project detail components
│   └── _components/                # Homepage-only components
├── components/                     # ONLY truly shared components
│   ├── Nav.tsx                     # Used across 5+ layouts
│   ├── PageHero.tsx                # Used across 9+ pages
│   ├── Skeleton.tsx                # Used 15+ times
│   └── ui/                         # Reusable UI primitives
└── lib/                            # App-wide shared utilities
    ├── db.ts
    ├── logger.ts
    └── types.ts
```

**The `_lib` folder pattern:**
- `_components/` = React components only (.tsx files)
- `_lib/` = non-component utilities (types.ts, constants.ts, helpers.ts, utils.ts)
- Use relative imports: `import { Foo } from "../_lib/types"`
- Barrel exports (index.ts) can stay in `_components/` to re-export from `_lib/`

**Rules for Component Placement:**

**Move to `src/app/.../_components/` when:**
- Component is used by only ONE page/route
- Component is tightly coupled to that page's data models or logic
- Component contains page-specific business logic

**Keep in `src/components/` when:**
- Component is used by 3+ different pages/routes
- Component is a reusable UI primitive (buttons, inputs, modals)
- Component is a design system element (layout patterns, displays)

### Import Patterns

Within `_components`, use **relative imports** for sibling files:
```tsx
import { PreviousReportsDropdown } from "./PreviousReportsDropdown";
```

Use **absolute imports** from `@/components/` for truly shared components:
```tsx
import { PageHero } from "@/components/PageHero";
```

### Server vs Client Components

**Default to server components** for pages (`page.tsx`):
- No `'use client'` directive
- Async functions for data fetching
- Pass data to client components as props

**Use client components** (`'use client'`) for:
- Interactive state (useState, useEffect)
- Event handlers (onClick, onChange)
- Browser APIs (localStorage, window)

**Wrapper pattern** (recommended for pages with both server and client needs):
```tsx
// src/app/markets/portfolio/page.tsx (server)
import { PortfolioPageContent } from "./PortfolioPageContent";

export default async function PortfolioPage() {
  const holdings = await fetchHoldings();
  return <PortfolioPageContent initialHoldings={holdings} />;
}

// src/app/markets/portfolio/PortfolioPageContent.tsx (client)
"use client";

export function PortfolioPageContent({ initialHoldings }: Props) {
  const [activeTab, setActiveTab] = useState("holdings");
  // ... interactive logic
}
```

### Naming Conventions

- Page files: `page.tsx` (Next.js convention)
- Client wrappers: `<Feature>PageContent.tsx` or `<Feature>Content.tsx`
- Shared components: PascalCase, descriptive name
- Component folders: `_components/` (with underscore prefix)
- Utility folders: `_lib/`, `_utils/` (when co-locating utilities)

---

## 4. Style Guide

### Hero Sections

All page hero sections must use the `PageHero` component from `@/components/PageHero`.

**Required Pattern:**
```tsx
import { PageHero } from "@/components/PageHero";

<PageHero title="Page Title" subtitle="Brief description or stats" />;
```

**Rules:**
- **No icons before titles** — titles are clean text only
- **Consistent styling** — `PageHero` handles responsive design, typography, and spacing
- **Actions support** — use `actions` prop for page-level buttons
- **Custom slots** — use `actionSlot` for complex custom action areas

**PageHero Props:**
```typescript
interface PageHeroProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: PageHeroAction[];
  actionSlot?: ReactNode;
}
```

### ACP Pillars

Valid pillar values: `quality`, `replace`, `build`, `experiment`, `distribute`

Use `AcpPillarBadge` component for displaying pillars consistently.

### Best Practices Summary

1. **Always revalidate after DB writes in API routes**
2. **Log revalidation for debugging**
3. **Include revalidation in PR reviews** — every new API route that mutates data must have revalidation
4. **Test revalidation locally** with `npm run build && npm start`
5. **Don't over-invalidate** — map out data dependencies carefully

---

## 5. Scripts Folder Discipline

`scripts/` is for tooling that gets re-used. One-shots get deleted after they run; the canonical record is the git history and the resulting state in the database / `drizzle/` folder.

### Folder layout

Every file under `scripts/` lives in exactly one of these subdirectories:

| Folder | Purpose | Examples |
| ------ | ------- | -------- |
| `seed/` | Idempotent seeders for reference data | themes, analysts, market reference |
| `backfill/` | Reusable batch-processing utilities (a workflow, not a one-shot row update) | profile generation, batch preparation/ingestion |
| `pipelines/` | Long-running or scheduled jobs (GH Actions, cron, operator-invoked daemons) | scanners, research-job processors, social fetchers |
| `portfolio/` | Portfolio export / accounting tools | populated portfolio Excel exports |
| `ops/` | Operational maintenance | cache clears, DB backups, build hooks |

No loose files at the top level of `scripts/`.

### Don't add to `scripts/` — these belong elsewhere or get deleted after running

- **Migration apply/verify scripts for a single numbered migration.** The canonical artifact is the SQL file in `drizzle/`. If you wrote `apply-migration-NNNN.ts` to push a SQL file once, delete it after the migration is applied. Same for `verify-migration-NNNN.ts`.
- **"Numbered batch" backfills** (`backfill-batchN.ts`). If the work is genuinely batched, write one parameterised script in `backfill/` that takes the batch as input.
- **One-shot fix / dedupe / purge / inspect probes.** Run them, verify, then delete in the same PR. If you think you'll need it again, generalise it into `ops/` or `backfill/` first — don't leave the narrow probe behind.

### Naming inside a folder

Drop the redundant prefix once the folder communicates the intent.

- `seed/themes.ts` — not `seed/seed-themes.ts`
- `backfill/ticker-profiles.ts` — not `backfill/backfill-ticker-profiles.ts`
- `ops/clear-cache.ts` — not `ops/ops-clear-cache.ts`

### One source format per script

Don't keep both `.mjs` and `.ts` versions of the same script. Prefer `.ts` for type safety. If you need to convert an existing `.mjs`, replace it — don't duplicate it.

### External references must be updated atomically

Any script invoked by `package.json`, `.github/workflows/`, application code (subprocess), or cron must have those references updated in the same commit as a rename or move. Known integration points to check before moving a script:

- `package.json` `scripts` block (`postbuild`, etc.)
- `.github/workflows/*.yml` `run:` lines
- Application code calling `path.join(process.cwd(), "scripts", ...)` (grep for `"scripts"` in `src/`)
- Cron entries documented in script headers (e.g. `process-research-jobs-prod.ts`)
