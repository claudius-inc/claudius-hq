# Claudius HQ — Agent Instructions

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
