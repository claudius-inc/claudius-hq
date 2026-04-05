# Claudius HQ — Agent Instructions

## Git Commit & Push Policy

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

**Do NOT commit as any other user** (e.g. `Claudius`, `Paperclip-Paperclip`, or your agent name).

```bash
# Correct pattern — always push after commit
git add <files>
git commit -m "feat: description

Co-Authored-By: Paperclip <noreply@paperclip.ing>"
git push origin main   # REQUIRED — never skip this step
```

Note: The `Co-Authored-By: Paperclip` trailer is required by Paperclip and will show as a second contributor on GitHub — this is expected.

**Never report work as "done" or "pushed" without confirming `git push` output shows success.**

---

## Logging

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

## Debugging HQ Issues

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

## Caching & Revalidation Strategy

### Cache Strategy

HQ uses Next.js **ISR (Incremental Static Regeneration)** for pages that fetch data.

**Time-based revalidation** (`export const revalidate = N`):

| Data Source | Revalidate Time | Rationale |
|-------------|-----------------|-----------|
| External APIs (Yahoo Finance, etc.) | 60-300s | Balance freshness vs. API rate limits |
| DB data with external enrichment | 60-120s | Reflects market data staleness |
| Internal DB-only data | **Don't use time-based** | Use on-demand revalidation instead |

```ts
// page.tsx with external data
export const revalidate = 60; // Re-fetch every 60 seconds

// page.tsx with DB-only data
// NO revalidate export — use on-demand revalidation
```

### On-Demand Revalidation

For data that changes via user actions or background jobs, use `revalidatePath()` immediately after DB writes.

**Location:** Centralized utility at `src/lib/revalidate.ts` (if exists), or inline in API routes.

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

### Invalidation Mapping

When data changes, invalidate these paths:

| Data Changed | Invalidate Paths |
|--------------|------------------|
| Projects | `/projects`, `/projects/[id]`, `/` |
| Ideas | `/projects/ideas` |
| Themes | `/markets/themes` |
| Theme Stocks | `/markets/themes` |
| Research Reports | `/markets/research`, `/markets/research/[ticker]` |
| Scanner Results | `/markets/scanner` |
| Portfolio | `/portfolio` |

**Example implementation:**

```ts
// api/projects/route.ts
export async function POST(req: Request) {
  const data = await req.json();
  const project = await db.insert(projects).values(data).returning();
  
  // Invalidate affected pages
  revalidatePath("/projects");
  revalidatePath(`/projects/${project[0].id}`);
  revalidatePath("/");
  
  return NextResponse.json(project[0]);
}
```

### GitHub Actions Integration

Background jobs (cron, workflows) should call dedicated revalidation endpoints after completing their work.

**Pattern:** Each workflow has a corresponding `/api/*/revalidate` endpoint.

```yaml
# .github/workflows/scanner.yml
- name: Trigger revalidation
  run: |
    curl -X POST "${{ secrets.HQ_URL }}/api/scanner/revalidate" \
      -H "Authorization: Bearer ${{ secrets.HQ_API_KEY }}"
```

**Existing endpoints:**
- `/api/scanner/revalidate` — Called after scanner workflow completes

**Add similar endpoints for:**
- Theme updates from external sources
- Portfolio sync jobs
- Any background data refresh

### Best Practices

1. **Always revalidate after DB writes in API routes**
   - Never assume the cache will expire "soon enough"
   
2. **Use specific paths, not broad invalidation**
   - ✅ `revalidatePath("/projects/123")`
   - ❌ `revalidatePath("/")` alone when only a project changed

3. **Log revalidation for debugging**
   ```ts
   logger.info("api/projects", "Revalidating paths", { 
     paths: ["/projects", `/projects/${id}`] 
   });
   revalidatePath("/projects");
   revalidatePath(`/projects/${id}`);
   ```

4. **Include revalidation in PR reviews**
   - Every new API route that mutates data must have revalidation
   - Reviewer checklist: "Does this endpoint revalidate all affected pages?"

5. **Test revalidation locally**
   ```bash
   # Build production locally to test ISR behavior
   npm run build && npm start
   ```

6. **Don't over-invalidate**
   - Invalidating too many paths defeats the purpose of caching
   - Map out data dependencies carefully
