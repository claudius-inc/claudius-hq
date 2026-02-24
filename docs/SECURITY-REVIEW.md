# Security Review: Claudius HQ API Routes

**Date:** 2026-02-15  
**Reviewer:** Security Sub-agent  
**Scope:** All API routes in `/src/app/api/`

---

## Executive Summary

Reviewed 44 API route files. Found **3 critical issues**, **5 high priority issues**, and **7 medium priority issues**. The application uses Next.js middleware for authentication but has several gaps that need addressing.

---

## 🚨 CRITICAL ISSUES (Must Fix)

### 1. API Key Leaked in Spawned Sub-agent Tasks

**File:** `/api/stocks/research/route.ts` (lines 50-70)

**Issue:** The `HQ_API_KEY` is embedded directly in the task string sent to OpenClaw gateway:

```typescript
task: `...
1. Mark job as processing:
   curl -X PATCH '...' -H 'x-api-key: ${process.env.HQ_API_KEY}' ...
```

**Risk:** The API key is exposed to:
- Sub-agent logs and context
- Anyone who can inspect spawned tasks
- Potential persistence in OpenClaw session history

**Fix:**
```typescript
// Option 1: Use gateway authentication passthrough
// Pass auth token to gateway, let it inject credentials

// Option 2: Use short-lived tokens
const tempToken = await generateShortLivedToken(jobId, "15m");
// ... use tempToken in curl commands
```

---

### 2. Telegram Webhook Has No Signature Verification

**File:** `/api/telegram/webhook/route.ts`

**Issue:** The webhook accepts any POST request without verifying the `X-Telegram-Bot-Api-Secret-Token` header. The only protection is the post-hoc `ALLOWED_USER_IDS` whitelist.

**Risk:** Attackers can forge webhook requests to:
- Trigger arbitrary commands
- Spam the service with fake updates
- Bypass rate limits (none exist anyway)

**Current protection is weak:**
```typescript
// This runs AFTER processing begins
if (!ALLOWED_USER_IDS.includes(telegramId)) {
  return NextResponse.json({ ok: true });
}
```

**Fix:**
```typescript
export async function POST(request: NextRequest) {
  // Verify Telegram secret token FIRST
  const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest of handler
}
```

Set webhook with secret:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://claudiusinc.com/api/telegram/webhook" \
  -d "secret_token=YOUR_SECRET"
```

---

### 3. No Rate Limiting on Any Endpoints

**Issue:** Zero rate limiting across all 44 API routes, making them vulnerable to:

| Attack Vector | Affected Routes |
|--------------|-----------------|
| DoS/Resource exhaustion | All routes |
| AI cost abuse | `/api/macro/insights/generate`, `/api/stocks/research` |
| Data scraping | `/api/themes`, `/api/portfolio/*`, `/api/stocks/*` |
| Brute force on session | `/auth` (if login attempts) |

**Fix:** Add rate limiting middleware:
```typescript
// middleware.ts or use vercel.json rate limits
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "1m"), // 60 req/min
});

// Apply stricter limits to expensive routes
const AI_ROUTES = ["/api/macro/insights/generate", "/api/stocks/research"];
// 5 req/min for AI routes
```

---

## ⚠️ HIGH PRIORITY ISSUES

### 4. Public Macro Routes Expose Potentially Sensitive Data

**Files:** `/api/macro/route.ts`, `/api/macro/insights/route.ts`

**Issue:** Middleware explicitly bypasses auth for these routes:
```typescript
// middleware.ts
if (pathname === "/api/macro" || pathname.startsWith("/api/macro/insights")) {
  return NextResponse.next();
}
```

**Risk:** Economic indicator data and AI-generated insights are publicly accessible.

**Recommendation:** If intentional, add to documentation. If not, remove bypass.

---

### 5. Weak Session Authentication

**File:** `/middleware.ts`, `/lib/auth.ts`

**Issue:** Session validation is a simple string match:
```typescript
session?.value !== "authenticated"
```

**Problems:**
- No session ID for invalidation
- No server-side session storage
- No expiry verification at middleware level
- Cookie-only storage (no CSRF protection)

**Fix:** Implement proper sessions with:
- Unique session IDs
- Server-side session store (Redis/DB)
- Expiry timestamps
- CSRF tokens for forms

---

### 6. User Input Embedded in Shell Commands

**File:** `/api/stocks/research/route.ts`

**Issue:** Ticker is validated but still embedded in curl commands:
```typescript
curl -X PATCH '.../api/stocks/research/${jobId}' -H '...' -d '{"ticker":"${cleanTicker}"...'
```

While regex validation exists (`/^[A-Z0-9.]{1,10}$/`), the pattern allows dots which could be problematic in some contexts.

**Fix:** Use parameterized API calls instead of curl strings, or tighter validation.

---

### 7. Inconsistent Authentication Patterns

**Issue:** Some routes double-check auth in handlers, others rely solely on middleware:

**Routes with explicit isApiAuthenticated() checks:**
- `/api/stocks/reports` (POST, PATCH)
- `/api/stocks` (POST)
- `/api/portfolio/reports` (POST)
- `/api/ideas` (POST)
- `/api/research` (POST, DELETE)

**Routes relying only on middleware:**
- All GET routes
- `/api/portfolio/holdings/*`
- `/api/watchlist/*`
- `/api/alerts/*`
- `/api/themes/*`
- `/api/analysts/*`
- All DELETE routes

**Risk:** If middleware is bypassed or misconfigured, sensitive operations are unprotected.

**Recommendation:** Add explicit auth checks to all state-changing handlers.

---

### 8. IBKR File Upload Lacks Validation

**File:** `/api/ibkr/upload/route.ts`

**Issues:**
- No file size limit
- No file type verification beyond parsing
- No virus/malware scanning
- Relies only on middleware auth (no explicit check)

**Fix:**
```typescript
// Add file validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: "File too large" }, { status: 400 });
}

// Verify file type
const validTypes = ["text/csv", "application/vnd.ms-excel"];
if (!validTypes.includes(file.type)) {
  return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
}
```

---

## 🔶 MEDIUM PRIORITY ISSUES

### 9. No CSRF Protection

**Issue:** No CSRF tokens for state-changing operations. The app relies on:
- SameSite=Lax cookies (partial protection)
- API key auth (good for API, not for web forms)

**Recommendation:** Add CSRF tokens for session-authenticated requests.

---

### 10. Error Messages Expose Internal Details

**Multiple files** return raw error messages:
```typescript
return NextResponse.json({ error: String(e) }, { status: 500 });
```

**Risk:** Stack traces, SQL errors, and internal paths could leak.

**Fix:**
```typescript
console.error("API Error:", e);
return NextResponse.json(
  { error: "Internal server error" },
  { status: 500 }
);
```

---

### 11. Missing Input Length Limits

**Issue:** No length limits on user-provided content:
- Report content (could be megabytes)
- Notes fields
- Descriptions
- JSON payloads

**Fix:** Add length validation:
```typescript
if (content.length > 500_000) { // 500KB
  return NextResponse.json({ error: "Content too large" }, { status: 400 });
}
```

---

### 12. Hardcoded Allowed User IDs

**File:** `/lib/telegram/types.ts`

```typescript
export const ALLOWED_USER_IDS = [
  357112696, // Mr Z (@manapixels)
];
```

**Issue:** Hardcoded whitelist requires code changes to update.

**Recommendation:** Move to database or environment variable.

---

### 13. Hard Deletes on Financial Data

**Files:** `/api/ibkr/trades/route.ts`, `/api/ibkr/imports/route.ts`

**Issue:** Deleting trades/imports permanently removes financial records with no audit trail.

**Recommendation:** Implement soft deletes with `deletedAt` timestamp.

---

### 14. No Audit Logging

**Issue:** No logging of:
- Who made API requests
- What data was modified
- When changes occurred

**Recommendation:** Add audit logging for all state-changing operations.

---

### 15. SQL Construction (Low Risk)

**Issue:** While Drizzle ORM is used (parameterized by default), there's one raw SQL usage:
```typescript
// /api/stocks/research-status/route.ts
.where(inArray(sql`UPPER(${stockReports.ticker})`, tickers))
```

**Assessment:** This is safe as `stockReports.ticker` is a column reference, not user input. But review any future raw SQL additions carefully.

---

## ✅ GOOD PRACTICES OBSERVED

1. **Drizzle ORM** - All database queries use parameterized ORM calls (no SQL injection)
2. **Input Sanitization** - Tickers are uppercased and trimmed consistently
3. **ID Validation** - Numeric IDs are parsed with `parseInt()` and validated
4. **Error Handling** - Try/catch blocks around all async operations
5. **Middleware Pattern** - Centralized auth in middleware (when not bypassed)
6. **API Key + Session** - Dual auth methods supported

---

## REMEDIATION PRIORITY

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | API key in sub-agent tasks | 2-4 hours |
| P0 | Telegram webhook signature | 1 hour |
| P0 | Rate limiting | 2-4 hours |
| P1 | Session improvements | 4-8 hours |
| P1 | Consistent auth patterns | 2-4 hours |
| P1 | File upload validation | 1-2 hours |
| P2 | CSRF protection | 2-4 hours |
| P2 | Error message sanitization | 1-2 hours |
| P2 | Audit logging | 4-8 hours |

---

## NEXT STEPS

1. **Immediate:** Fix critical issues (P0) before next production deploy
2. **This week:** Address high priority issues (P1)
3. **This month:** Implement medium priority improvements (P2)
4. **Ongoing:** Consider penetration testing after fixes

---

*Report generated by security-review sub-agent*
