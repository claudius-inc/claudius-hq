# Claudius HQ — UX/Security Review
*Date: 2026-02-15*

## 🔴 Critical Issues

### 1. Telegram Webhook Not Verifying Secret Token
**File:** `src/app/api/telegram/webhook/route.ts`

Telegram can send a `X-Telegram-Bot-Api-Secret-Token` header to verify requests. Currently, the webhook accepts any POST request from anyone who knows the URL.

**Risk:** Attacker could send fake Telegram updates to trigger commands.

**Fix:**
```typescript
export async function POST(request: NextRequest) {
  const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest of handler
}
```

Then set the secret when registering webhook:
```bash
curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=YOUR_URL&secret_token=YOUR_SECRET"
```

---

### 2. Session Authentication is Weak
**File:** `src/lib/auth.ts`, `src/middleware.ts`

The session cookie value is just the string `"authenticated"`. Anyone who sets `hq_session=authenticated` cookie is logged in.

**Risk:** Trivial to bypass authentication.

**Fix options:**
1. **Simple:** Add a random session secret that's checked
   ```typescript
   const SESSION_VALUE = process.env.HQ_SESSION_SECRET || "fallback-change-me";
   ```

2. **Better:** Use proper session tokens with DB storage and expiry

---

## 🟠 High Priority Issues

### 3. API Key Exposed in Spawn Task String
**File:** `src/app/api/stocks/research/route.ts` (lines ~75-100)

The spawn task includes `${process.env.HQ_API_KEY}` in the task string, which gets logged and sent to the OpenClaw gateway.

**Fix:** Don't include API key in task string. The sub-agent should read it from env or use a different auth mechanism.

---

### 4. /api/macro Routes Are Public
**File:** `src/middleware.ts` (line 12-14)

```typescript
if (pathname === "/api/macro" || pathname.startsWith("/api/macro/insights")) {
  return NextResponse.next();
}
```

These routes bypass authentication. Verify this is intentional.

---

### 5. IBKR Upload Has No File Size Limit
**File:** `src/app/api/ibkr/upload/route.ts`

No validation on file size. Could be used for memory exhaustion attacks.

**Fix:**
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'File too large' }, { status: 400 });
}
```

---

## 🟡 Medium Priority Issues

### 6. Markets Dashboard Title Says "Stocks"
**File:** `src/app/markets/page.tsx` (line ~345)

```typescript
<h1 className="text-2xl font-bold text-gray-900">📊 Stocks Dashboard</h1>
```

Should be "Markets Dashboard" for consistency with the URL and nav.

---

### 7. Page Structure Inconsistency

| Page | Nav Location | Data Fetching |
|------|--------------|---------------|
| `/markets/*` | In `layout.tsx` | Client-side (useEffect) |
| `/projects` | In `page.tsx` | Server-side (async) |
| `/ideas` | In `page.tsx` | Server-side (async) |

**Recommendation:** 
- Move Nav to root layout or create consistent layout pattern
- Consider which pages need to be client components

---

### 8. Empty State Styling Inconsistent

**Projects page:**
```typescript
<div className="card text-center py-12 text-gray-400">
  No projects yet...
</div>
```

**Markets components:** Various different patterns for empty states.

**Fix:** Create an `<EmptyState>` component:
```typescript
// components/EmptyState.tsx
export function EmptyState({ icon, title, description }: Props) {
  return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
```

---

## 🔵 Low Priority / Recommendations

### 9. Add Rate Limiting
No rate limiting on API routes. Consider adding for:
- `/api/stocks/research` (spawns expensive sub-agents)
- `/api/macro/insights/generate` (calls AI)

Options: Upstash ratelimit, Vercel Edge Middleware

---

### 10. Add CSRF Protection for State-Changing Operations
POST/PATCH/DELETE operations should verify origin or use CSRF tokens.

---

### 11. Consider Adding Request Logging
Add structured logging for API requests to help debug and audit:
- Request path, method
- Auth status
- Response status
- Timing

---

## ✅ What's Good

1. **Drizzle ORM** — All queries are parameterized, no SQL injection risk
2. **Input validation** — Ticker symbols validated with regex
3. **Telegram whitelist** — User whitelist prevents unauthorized access
4. **Cookie security** — httpOnly, secure, sameSite flags set correctly
5. **Consistent max-width** — `max-w-6xl` used throughout
6. **formatDate utility** — Centralized date formatting

---

## Action Items (Priority Order)

1. [ ] **CRITICAL:** Add Telegram webhook secret verification
2. [ ] **CRITICAL:** Improve session authentication (random secret or proper tokens)
3. [ ] **HIGH:** Remove API key from spawn task string
4. [ ] **HIGH:** Add file size limit to IBKR upload
5. [ ] **MEDIUM:** Fix "Stocks Dashboard" → "Markets Dashboard"
6. [ ] **MEDIUM:** Standardize page structure (Nav in layouts)
7. [ ] **MEDIUM:** Create shared EmptyState component
8. [ ] **LOW:** Add rate limiting to expensive endpoints
9. [ ] **LOW:** Add request logging
