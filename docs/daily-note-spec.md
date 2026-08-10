# Daily Market Note ("The Tape") — Specification

**Status:** Requirements locked — converged (Fable-5 review R1–R3) · **Owner:** manapixels · **Last updated:** 2026-08-08 (rev 4)

A concise daily market summary in the style of [Tao of Trading](https://taooftrading.substack.com/),
condensed to ~half the source length and optimised for a daily Telegram push, with full depth on a
linked web page. This document is the source of truth for data sources, content schema, and the
generation pipeline. Code conforms to it; update this doc when requirements change.

**Runtime facts (verified against repo):**
- **DB is SQLite via Turso/libsql** (`drizzle-orm/libsql`, `dialect: "turso"`, `TURSO_DATABASE_URL`). The
  Neon MCP server in the environment is **not** used by this app. `sqliteTable` DDL is correct.
- **Jobs run as GitHub Actions `tsx` scripts** (precedent: `.github/workflows/momentum-report.yml`), not
  Vercel crons. The note-generation job MUST target this runner (see §8, §10). Actions cron is fixed UTC —
  handle DST in-job (§7a).

---

## 1. Goal & editorial principles

Tao of Trading's edge is **causal, not descriptive** — what *actually* moved the tape vs noise, with a
directional read and a skeptical desk voice. A 50% cut must protect that edge, not just the structure.

> **Amended by v2 §B.** Bullets no longer name individual companies. The rules below are stated in their
> amended form; `docs/daily-note-v2-spec.md` §1b carries the reasoning. In short: a cause for a single
> instrument is retrieved, dated and direction-checked by the renderer and printed on the DIVERGENCE and
> MOVERS lines, so a bullet that repeats a name is the redundancy the claim ledger exists to cut — and
> letting the model write one at all is how invented mechanisms get in.

**Irreducible core (must survive every cut):**
1. **The divergence verdict** — the one breadth / cross-asset / within-sector stat that *contradicts* the
   headline index move. This is the product. It renders as the deterministic **DIVERGENCE** line, which
   owns the names; a bullet may refer to that divergence collectively or by sector, never by ticker.
   *(Depends on datasets that must be built — see §3, §5.)*
2. **A directional read with a *because*** — "software sold off *on good numbers*" beats "software fell."
3. **2–3 levels that act as if/then triggers** — "gold above $4,300," "10Y at 4.50%."
4. **One desk voice-beat per issue** — exactly one bit of vernacular. One, not five.

**Style rules (enforced at generation time):**
- Every `WHAT MATTERS` bullet carries a **because / despite / on-[good/bad]-numbers**. No naked recaps.
- **Bullets do not name individual companies** — not by ticker ("AKAM") and not by name ("Akamai").
  DIVERGENCE and MOVERS own the names and render immediately above. A bullet refers to them collectively
  ("three of the four biggest reporters fell on beats") or by sector, and keeps its because/despite: macro,
  breadth, the index and sector relationships are all sayable without naming an instrument. Enforced by
  default-deny in `validate.ts`, not by the prompt (v2 §1b).
- **Exact prices only for actionable levels; round everything contextual.**
- Budget: **3–4 What-Matters bullets, ~6 named tickers across the deterministic lines, ~3 watch-levels,
  1 line each** for bull/bear/book.
- **Cut quiet sections — do not pad them.** No positioning tell today → omit The Book.
- Bull/bear box is balanced; the **read leans** via the hook + tells. Never end symmetric.
- **The divergence number goes in the hook** — it survives the notification preview.

---

## 1a. Data-integrity policy (NON-NEGOTIABLE)

The note brands itself as factual ("how many decliners"). Therefore:

- **Never fabricate or estimate a headline number.** If a feed fails or returns non-authoritative data,
  **omit that section and any claim derived from it** — do not ship an approximation.
- **Breadth is gated on source.** `breadth.ts` silently falls back to *invented* counts on WSJ failure
  (`fetchBreadthFallback`, hard-codes `advances/declines`). The pipeline MUST require
  `breadth.source === "WSJ Markets Diary"` (exact string, set at `breadth.ts:262`); otherwise omit breadth
  AND any breadth-based hook/divergence verdict. The estimated fallback is banned from the note.
  - **Also banned:** `mcclellan` on the same object is a *pseudo*-McClellan computed from SPY closes
    (`fetchMcClellanData`), attached regardless of source — never cite it.
  - **Staleness:** a WSJ 200 can still be yesterday's cached counts (evening lag). Parse the WSJ payload's
    own date field into `asOf` and reject if it isn't today-ET — `updatedAt` is only fetch time. (The §7a
    session gate mostly covers this, but the note must not carry a fact stamped with the wrong day.)
- **Every fact carries provenance + timestamp.** `StructuredFacts` records `{value, source, asOf}` per
  field; the renderer skips any field whose `source` is a fallback/estimate.
- **LLM prose may only cite numbers present in `StructuredFacts`** — enforced mechanically (§8, numeral check),
  not by prompt alone.

---

## 2. Delivery model (LOCKED)

- **Telegram push** = concise **Core** note (~400–450 words, one message), sent to the channel after close.
- **Spotlighted sectors** get a **one-line callout** appended to the push (§6).
- **Full depth** lives on a **web note** at `/markets/notes/[date]`, linked at the bottom. No inline buttons.

```
Telegram:  concise Core  +  🛢 XLE one-liner  +  🥇 Gold one-liner  →  [Full note ↗ web]
Web note:  full sector board + within-sector divergence + spotlighted deep-dives
```

### Telegram mechanics

Base helpers exist in `src/lib/telegram/api.ts` (`parse_mode:"HTML"`, `disable_web_page_preview:true`,
`message_id` return) **but are not production-safe for a critical push and must be REPLACED, not wrapped:**

- **Rewrite/extend the helpers to expose the response body.** The current `sendMessage` returns
  `message_id | null` and `editMessage` returns bare `res.ok` — a wrapper cannot recover `data.description`,
  so it cannot distinguish a real 400 from the benign "message is not modified" 400. Add hardened variants
  (e.g. in a new `src/lib/notes/telegram.ts`) that return `{ ok, description, message_id }`, **log
  `data.description` via `logger`**, and **throw** on genuine failure (a silent no-send is unacceptable).
  `editMessage` must treat `description` containing "message is not modified" as success (idempotent re-runs).
- **Retry once on 429** honoring `retry_after` before throwing (reuse the `withYahooRetry` pattern in
  `scanner/yahoo-rate-limiter.ts`). Channel posts commonly rate-limit.
- **On job failure or §7a skip, alert the admin** — replicate the `Notify on failure` curl step in
  `.github/workflows/momentum-report.yml` so a silent no-note is visible.
- **Channel id:** `sendMessage(chatId:number)` accepts the numeric `-100…` channel id (fits 2^53). Use
  `TELEGRAM_NOTE_CHANNEL_ID` as a number; `@handle` strings are NOT supported by the typed signature.
  **The bot must be an admin of the channel with post rights.**
- **Escaping — escape ALL non-markup text, not just dynamic values.** Static template literals ("S&P 500"),
  LLM prose, tickers, and company names ("AT&T") routinely contain `&`, `<`, `>`. Rule: HTML-escape every
  text node (`& → &amp;`, `< → &lt;`, `> → &gt;`), **then** wrap in `<b>/<i>/<code>/<a>` tags. A single bare
  `&` or `<1%` is a guaranteed 400. Never use MarkdownV2.
- **4096-char cap** (UTF-16). Assert `text.length <= 4096` after render; drop the lowest-priority
  What-Matters bullet if over. (Sample is ~2.1k units with markup — safe; `▼▲‑·` = 1 unit, emoji = 2.)
- **First line ≤ ~120 chars, no leading emoji, plain-readable** — notifications truncate and strip markup.
- Reliable tags only: `<b>`, `<i>`, `<code>`, `<a href>`. No `<pre>` tables (wrap numbers in `<code>`).
- Persist `message_id`; a typo fix is a silent `editMessageText`.

---

## 3. Data sources (statuses corrected after R1 verification)

| Element | Source | Existing module | Status |
|---|---|---|---|
| Index closes S&P/Nasdaq/Dow/Russell + % | Yahoo `^GSPC/^IXIC/^DJI/^RUT` | `scanner/yahoo-fetcher.ts` | ✅ |
| **Rates curve 2Y/10Y/30Y + bp change (same-day)** | **US Treasury Daily Par Yield OData XML** (`home.treasury.gov/.../pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY` → `BC_2YEAR/BC_10YEAR/BC_30YEAR`). Publishes **~6pm ET** (a 3:30pm ET quote, not the 4pm equity close). **Trigger must run ≥6:15pm ET** or poll-with-deadline for today's `NEW_DATE`, else §1a-omit. | *(new client)* | ⚙ add |
| Rates history/percentile (context only) | FRED `DGS2/DGS10/DGS30` (T+1, history only — NOT for same-day print) | extend `fetch-macro-data.ts` | ⚙ add |
| Breadth: gainers/decliners/ratio/new H/L | WSJ Markets Diary — **gate on `source`, omit on fallback (§1a)** | `markets/breadth.ts` | ⚠ conditional |
| VIX level, day chg | Yahoo `^VIX` (already quoted) | `markets/sentiment.ts` | ✅ |
| VIX YTD range + percentile + trend | `^VIX` 1y history + `calculatePercentile` (exists) | *(wire percentile/trend)* | ⚙ small |
| Cross-asset DXY / Gold / Crude / BTC (**16:00 ET bar**) | Yahoo `DX-Y.NYB / GC=F / CL=F / BTC-USD` via **`chart()` 1–5-min intraday, take the 16:00 ET bar** (NOT a `quote()` at send time — CME futures reopen 6pm ET, so a 6:15pm quote is the new session; BTC is 24/7). `asOf` = bar time. | `fetch-macro-data.ts`, `markets/gold*.ts` | ⚙ small |
| Sector tape (11 SPDR ETFs, 1d%) | Yahoo 11-ticker batch quote (note `regime-panel.ts` lists only 10 — XLC missing — and gives crowding not 1d%; `api/sectors/momentum/route.ts` is per-ticker `chart()`) | widened `fetchBatchQuotes` | ⚙ small |
| **S&P 500 constituents + GICS sector + float weight** | **NEW dataset** — seed from SPDR **daily holdings XLSX** `.../etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-<etf>.xlsx` (NOT the HTML fund pages in `utils.ts`). `xlsx@^0.18.5` already in `package.json`. XLSX gives ticker/shares/**weight** (not market cap). Quarterly refresh. | *(new table + refresh job)* | ⚙ **build** |
| Constituent 1d% grouped by sector (divergence input, §5) | Yahoo batch quote over the constituent list above | export/widen `fetchBatchQuotes` | ⚙ assemble |
| Index-contribution ("green only on N names") | **SPY daily holdings XLSX** (`holdings-daily-us-en-spy.xlsx`) for **float-adjusted weights** × constituent 1d%; **reconciliation gate** (§8) — omit the claim if `\|Σ wᵢ·rᵢ − index %chg\|` exceeds tolerance. Full `marketCap` alone is float-unadjusted and can flip the sign on a ~0% day. | *(compute in assemble)* | ⚙ depends on dataset |
| Dealer gamma / **pin** | needs library extraction from `api/markets/gex/route.ts`; define pin = max\|GEX\| strike; aggregate 2–3 expirations; SPX-scale symbol | `markets/gex.ts` (calc only) | ⚙ refactor |
| Single-stock earnings actual vs est | Yahoo per-ticker `earningsHistory`; **"who reported today" needs a calendar** (see below) | `scanner/events/earnings.ts` | ⚠ discovery gap |
| **Econ calendar: actual + prior + release time (ET)** | **FRED** release calendar + series observations, free on the existing key. Consensus is unavailable on any free feed and is settled as out of scope (v2 §I), so the note reports actual **vs prior** and states that basis. Release times are a hardcoded per-release map; FRED publishes dates only | `notes/sources/fred-releases.ts` | ✅ built |
| Guidance nuance + prose synthesis | LLM (Gemini) — **numeral-validated (§8)** | `lib/ai/gemini.ts` | ⚙ LLM step |
| Delivery | Telegram Bot API (hardened, §2) | `lib/telegram/api.ts` | ⚠ harden |

### Universe (LOCKED)
- **Headline breadth** = full NYSE from WSJ (conditional, §1a).
- **Within-sector divergence + index-contribution** = **S&P 500 constituents grouped by GICS**, SPDR ETF as
  each sector's benchmark. This constituent+sector+cap dataset **does not exist in the repo** and is a
  build item with a rebalance/refresh story (cf. `scanner/events/index-rebalancing.ts`).

### Earnings discovery
There is no repo-wide "who reported today" feed. Do **not** sweep 500 `quoteSummary` calls (earnings.ts's
private 350ms limiter is uncoordinated with `acquireYahooSlot`, risking a burst). Options: (a) add an
`earnings_date` column to the constituent dataset and query only the handful reporting today, or (b) a
day-level earnings calendar.

**Resolved:** (b), via **Finnhub**, whose *earnings* calendar is free (its economic one is not). One call
returns the whole day with an explicit `bmo`/`amc` `hour`, which is authoritative timing and strictly
better than Yahoo's placeholder stamp. `FINNHUB_API_KEY` must be set or this degrades to the stamp — see
Environment variables above.

### Environment variables

All of these must be present in `.github/workflows/daily-note.yml`. A key the code reads but the workflow
does not pass degrades silently by design (§1a), so the section it feeds simply stops appearing — the
failure mode is a quieter note, not an error.

| Var | Required | Feeds |
|---|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | yes | persistence |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | yes | send / edit / admin alerts |
| `FRED_API_KEY` | yes | DATA (§E printed releases) **and** TOMORROW'S TELLS (the release calendar) |
| `DEEPSEEK_API_KEY` | no | prose. Absent → the full deterministic note ships |
| `FINNHUB_API_KEY` | no, but load-bearing | authoritative `bmo`/`amc` earnings timing and the **second** consensus source. Absent → Yahoo's 16:00 placeholder stamp is the only timing signal, and the two-source agreement rule can never be met, so no earnings clause can ever say "a beat" or "a miss" (v2 §A) |

**`FMP_API_KEY` is retired.** FMP's economic calendar is plan-restricted, no key was ever configured, and
the TELLS section it fed therefore rendered as nothing every night. FRED answers the same question for
free on the key already in use; consensus is settled as unavailable rather than pending (v2 §I).

---

## 4. Core push — content schema

Order is fixed. Sections with no authoritative signal are omitted (§1a), never padded.

Everything above WHAT MATTERS is deterministic and renders **before** any prose, which is what makes the
claim ledger's guarantee hold: a bullet can never repeat a numeral the renderer already owns.

1. **Hook** — one line, ≤120 chars, plain-readable, leads with the divergence + one number. *LLM, numeral-validated; falls back to a deterministic template, never dropped.*
2. **THE TAPE** — indices (close + %); breadth (NYSE counts + A/D ratio + new H/L) **only if WSJ-sourced**;
   VIX (level, day chg, YTD-range + percentile, multi-day trend).
3. **TREND** — the index's 5- and 21-session moves, plus the leading and lagging benchmark over 21 (v2 §D). Labelled in sessions, never as "1 week" / "1 month".
4. **DATA** — economic releases that printed today, actual vs **prior** (v2 §E). No consensus exists on a free feed, and the basis is stated rather than implied.
5. **RATES** — 2Y/10Y/30Y level + bp change (**Treasury same-day feed**); one-line curve read + why *(LLM, numeral-validated — its numerals, e.g. −2bp/+24bp, are derived facts)*.
6. **CROSS-ASSET** — DXY, Gold, Crude, Copper, BTC (**16:00 ET bar via intraday `chart()`, not a send-time quote**); sector tape one-liner (top-2 up / bottom-2 down).
7. **SPOTLIGHT callouts** — one line per enabled sector (§6). Omitted if none enabled/qualifying.
8. **DIVERGENCE** — the sharpest within-sector divergence, with its names (§5).
9. **MOVERS** — up to 3 lines, `TICKER ±x.x% — <retrieved reason>`, or a bare `TICKER ±x.x%` when no rung passed (v2 §A, §B). **The only place a cause for an individual instrument may appear**, and it is composed by the renderer, never by the model.
10. **WHAT MATTERS** — 3–4 bullets, each with a because/despite, none naming a company. Numeral-validated.
11. **BULL / BEAR** — one line each, a specific argument each.
12. **THE BOOK** — dealer gamma / pin (omit if GEX unreliable/absent).
13. **TOMORROW'S TELLS** — scheduled econ releases with ET times, from FRED's release calendar. Header label is next-trading-day-dynamic ("MONDAY'S TELLS" on a Friday).
14. **Footer** — `<a href>` link to `…/markets/notes/YYYY-MM-DD`.

Rendering: HTML (escaped per §2), blank line between sections, bold the *label* not the line. **No emoji and
no ▲/▼ glyphs** — both substitute per platform in the mobile UI font, so direction is signed text ("+1.5%")
throughout, which also keeps template and prose consistent. `<code>` is web-only: in the push it buys no
column alignment and widens lines.

---

## 5. Within-sector divergence rule

1. Compute each S&P 500 constituent's 1d %; group by GICS sector (from the §3 dataset).
2. Sector direction = SPDR sector ETF 1d %.
3. **Sector DOWN → surface constituents that closed GREEN** (relative-strength tells).
4. **Sector UP → surface constituents that closed RED** (relative-weakness tells).
5. Rank by `|constituent% − sectorETF%| × liquidity`; cap **3 names / sector**.
6. Show only where divergence is meaningful (e.g. green name in a sector down > 1%; threshold configurable).
   Quiet sectors dropped.

Used in the Core push (single sharpest divergence → the deterministic **DIVERGENCE** line, §4.8) and the web
note (all qualifying). **Amended by v2 §B:** the sharpest divergence is no longer routed into a What-Matters
bullet. It renders as its own line, which owns the names; a bullet may still read the divergence, but
collectively or by sector.

---

## 6. Spotlight (UI-controlled)

- **Standard sector tape** (top-2 up / bottom-2 down) always renders — not gated by spotlight.
- **Spotlight ON** for a sector →
  - **Push:** a one-line callout after CROSS-ASSET, e.g.
    `🛢 XLE +0.9% — crude $79; leaders XOM +1.8%, EOG +1.4%; laggard SLB ‑0.6%`
    `🥇 Gold ▼1.1% $4,288 — lost $4,300; GDX ‑2.3%, miners leading down`
  - **Web note:** full deep-dive — gainers/losers, within-sector divergence, and (XLE/Gold) crude/positioning
    + level context from `gold.ts` / `thesis/gold.ts`.
- **Defaults:** `XLE`, `GOLD` ON; others OFF.

### UI
`/markets/notes/settings` — checkbox per sector (11 GICS SPDR + `GOLD` pseudo-sector). Reads/writes
`note_spotlight_config`; generation reads it at run time.

### Storage (Drizzle, `src/db/schema.ts`) — needs a drizzle-kit migration in `./drizzle`

```ts
export const NOTE_SPOTLIGHT_SECTORS = [
  "XLK","XLF","XLY","XLC","XLV","XLI","XLP","XLE","XLB","XLRE","XLU","GOLD",
] as const;
export type NoteSpotlightSector = (typeof NOTE_SPOTLIGHT_SECTORS)[number];

export const noteSpotlightConfig = sqliteTable("note_spotlight_config", {
  sector: text("sector").primaryKey(),                 // one of NOTE_SPOTLIGHT_SECTORS
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),   // repo convention
});

export const dailyNotes = sqliteTable("daily_notes", {
  date: text("date").primaryKey(),                     // YYYY-MM-DD, US market date (America/New_York)
  facts: text("facts").notNull(),                      // JSON: StructuredFacts (value/source/asOf per field)
  pushHtml: text("push_html").notNull(),
  webBody: text("web_body").notNull(),
  telegramMessageId: integer("telegram_message_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

---

## 7. Web note layout (`/markets/notes/[date]`)

1. Header — date, hook, tape/rates/breadth/VIX strip (mirror of push).
2. What Matters / Bull-Bear / Book / Tells (room for a second example per point).
3. Full sector board — 11 sectors, 1d% heatmap, biggest gainer + loser each.
4. Within-sector divergence — every qualifying sector (§5).
5. Spotlight deep-dives — one block per enabled sector; XLE + Gold get crude/positioning + levels.
6. Disclaimer footer.

Renders from persisted `daily_notes` (facts + webBody). Existing Tailwind/dashboard components. Serves as archive.

---

## 7a. Trading-session, timezone & holiday gate (CORRECTNESS, not cadence)

- **Market date** = current date in `America/New_York`. All "today" logic uses ET.
- **Session gate (required):** before generating, confirm today was a US trading session **and the cash
  session has closed**. Require BOTH: (a) `^GSPC` quote `regularMarketTime` is today-ET, AND (b)
  `marketState ∈ {POST, POSTPOST, CLOSED}`. `regularMarketTime`-only passes mid-session (10am on any trading
  day) — a `workflow_dispatch` or DST bug would then snapshot live prices as "the close." On a **holiday**
  Yahoo returns the stale prior close at ~0% with a not-today `regularMarketTime` → skip (no note), and
  **alert the admin** so the silent skip is visible. A graceful skip exits 0, so the workflow's
  failure-only curl step will NOT fire — **the gate script itself must send the admin alert** (or exit a
  distinct code the workflow reacts to).
- `regularMarketTime` comes back as a `Date` (sometimes string/epoch) — reuse the defensive `parseTime`
  coercion at `src/lib/markets/gold.ts:208-214`. There is **no** US market-holiday calendar in the repo to
  reuse (grep confirmed), so the quote-based gate is the chosen mechanism.
- **Half-days** (Jul 3, post-Thanksgiving) close 1pm ET; `marketState` flips to POST after the actual close,
  so the same gate handles them — snapshot at the real close.
- **DST:** Actions cron is fixed UTC; compute the ET trigger in-job so the post-close time doesn't drift.

---

## 8. Generation pipeline

Deterministic numbers; LLM for prose only; numbers never originate from the model.

**Trigger:** GitHub Actions cron pinned to **≥6:15pm ET** (after the Treasury feed publishes, §3), DST
computed in-job (§7a). `workflow_dispatch` allowed but still subject to the §7a gate.

```
0. GATE                         src/lib/notes/session.ts
   - ET market-date + trading-session + marketState check (§7a); skip + alert if not a closed session.

1. ASSEMBLE (deterministic)     src/lib/notes/assemble.ts
   - indices, VIX (+percentile/trend), cross-asset (16:00 ET bar via intraday chart(), asOf=bar), sector-ETF 1d%
   - rates 2Y/10Y/30Y from Treasury same-day feed (poll-with-deadline; omit if unpublished) (+ FRED history)
   - breadth from WSJ — GATED on source + asOf==today (§1a); omit if fallback/stale
   - constituent 1d% grouped by GICS (from constituent dataset) → divergence set (§5)
   - index-contribution: Σ(float-weightᵢ × rᵢ) from SPY holdings; reconcile vs index %chg —
     emit "green only on N names" fact ONLY if |Σwr − index%| ≤ 0.10pp, else omit the claim
     (SPY tracking drag is typically single-digit bp, so the gate rarely false-fires)
   - GEX pin (refactored lib, aggregated 2–3 expirations, SPX-scale symbol); FRED release calendar (ET)
   - earnings actual-vs-est only for names reporting today (from dataset/calendar)
   → StructuredFacts (JSON), incl. DERIVED facts (bp changes, A/D ratio, 2s10s spread, percentiles),
     each field = {value, source, asOf}

2. WRITE PROSE (LLM)            src/lib/notes/write.ts
   - input: StructuredFacts (+ spotlight config); output: hook, one-line curve read, 3–4 bullets, bull, bear, book line
   - prompt forbids claims lacking a supporting fact (esp. index-contribution, guidance $), and forbids
     magnitude adjectives ("flattened hard") not supported by the number's size.

3. VALIDATE (deterministic)     src/lib/notes/validate.ts
   - Token grammar, not blanket numeral matching. Whitelist non-fact tokens: clock times ("8:30"),
     dates, tenor labels ("2Y/10Y/30Y"), MA names ("50-day"), small counts ("3 days").
   - Typed classes matched against DERIVED facts with per-class tolerance: prices/levels (tight — but
     accepts §1's rounding convention, e.g. "VIX 14"≈14.2, "$79"≈79.xx), percent-changes ("Russell ‑1.8%"),
     ratios ("3:2"≈A/D), spreads/bp ("+24bp"=2s10s), percentiles ("~28th"), counts ("N names"),
     econ actual/prior ("+256k vs +142k", "4.0%" — matched against the FRED macro fact; EPS figures and
     price targets are deliberately NOT pooled, so a bullet citing one fails automatically — v2 §H0.1).
   - On mismatch: regenerate that field once with the mismatch cited. If it still fails:
     • hook → fall back to a deterministic facts-only template hook (NEVER drop — it's required, §4.1);
     • a What-Matters bullet → drop it, and drop any bull/bear line that references it.

4. RENDER                       src/lib/notes/render.ts
   - renderPush(facts, prose, spotlight) → HTML, escaped (§2), assert ≤ 4096
   - renderWeb(facts, prose, spotlight)  → web body

5. PERSIST + SEND
   - upsert daily_notes; hardened sendMessage(channelId, pushHtml) (§2) → store message_id
   - re-run edits the existing message via message_id (idempotent per date)
```

**Runner:** GitHub Actions `tsx` (repo precedent). All Yahoo access goes through the single
`acquireYahooSlot()` limiter — do NOT use `earnings.ts`'s separate 350ms limiter in the same job, and do NOT
use `batchFetchMetrics` (pulls 14 months history/ticker). Use an exported, type-widened `fetchBatchQuotes`
(needs `regularMarketChangePercent`, `marketCap`). ~503 names ≈ 26 batched requests ≈ seconds.

---

## 9. Reference sample (Core push)

Fri Aug 7, 2026 close — hot payrolls, narrow tape, gold loses $4,300. *(Rates from Treasury same-day feed;
cross-asset @ 4pm ET; breadth shown only because WSJ-sourced.)*

```
S&P ~7,704 -0.1% at highs — but decliners beat gainers 3:2, front end led rates higher. Narrow tape.

THE TAPE
S&P 7,704 -0.1% · Nasdaq +0.2% · Dow -0.6% · Russell -1.8%
Breadth (NYSE): 1,150 up / 1,690 down · A/D 0.68 · new H/L 61 / 44
VIX 14.2 +0.6 — still ~28th %ile of its YTD 11.8–29.4, but up 3 days running

TREND — S&P 5s +0.8% · 21s +3.1% · over 21 sessions XLE leads +7.4%, XLRE lags -4.2%

DATA (vs prior — no consensus feed) — Payrolls +256k vs +142k prior revised · Unemployment 4.0% vs 4.1% prior

RATES — 2Y 4.18% +11bp · 10Y 4.42% +9bp · 30Y 4.71% +6bp
Front end led the selloff → 2s10s flattened 2bp to +24bp. The cut just got repriced out.

CROSS-ASSET — DXY 99.8 +0.4% · Gold $4,288 -1.1% · Crude $79 +0.6% · Copper $4.52 -0.8% · BTC $118k +1.2%
Sector leaders Energy +0.9%, Comm Svcs +0.3%
Sector laggards Real Estate -2.1%, Utilities -1.6%

XLE — leaders XOM +1.8%, EOG +1.4%; laggard SLB -0.6%
Gold — $4,288; GDX -2.3%

DIVERGENCE — Financials -1.1%, but ICE +0.9%, CME +0.7% closed green in a red sector

MOVERS
AKAM fell -6.8% after reporting EPS $1.59
MRNA rose +4.1% on a Goldman Sachs upgrade
SLB fell -2.4%

WHAT MATTERS
Payrolls ran hot. +256k against a +142k prior takes September's cut off the table, and rate-sensitives wore it — REITs, utilities and the Russell all bottom of the board.
The exchanges bucked their sector. Financials closed red while the two clearing names rose, which is what higher-for-longer does to that business model.
The flat index flatters the day. Strip the top contributors and it is clearly negative — narrow leadership dressed as strength.

BULL — +256k jobs, 4.0% unemployment, AI leaders still printing; dips get bought.
BEAR — highs on three stocks while breadth runs 3:2 negative and cuts fade. VIX 14 isn't pricing it.

THE BOOK — dealers long gamma, pin near 7,700 on SPY, +0.1% away

MONDAY'S TELLS — CPI Wed 8:30 ET · Jobless claims Thu 8:30 ET

<a href="…/markets/notes/2026-08-07">Full note</a>
```
*Notes:* (1) Escaping — rendered `&amp;` for every `&` (incl. "S&P") and all prose; `<`/`>` never emitted raw.
(2) **No bullet names a company.** The two clearing names are printed on the DIVERGENCE line directly above and
referred to collectively in the bullet; the earnings and upgrade causes are on MOVERS, composed by the renderer
from dated, direction-checked events. A bullet that named either alongside a causal connective would be dropped
before sending (v2 §1b).
(3) DATA is measured against the **prior**, and says so. No free feed carries consensus (v2 §I, settled), so the
note never words a prior-gap as a consensus miss. "prior revised" is not decoration — the revision is often
larger than the surprise being reported.
(4) MOVERS line 3 is rung 7: the ranking says the name mattered, no reason passed the ladder, so the bare move
is the correct output. Inventing one would be the failure the whole section exists to prevent.
(5) The index-contribution claim ("strip the top contributors") is **S&P-only** (the LOCKED universe) via SPY
float weights, and ships only if the reconciliation gate passes (§8). A Nasdaq version would need NDX weights — out of scope.

---

## 10. Build order (all slices BUILT)

1. ✅ **Shippable skeleton** (`453c377`): `daily_notes` + migration 0021; session gate (§7a); assemble for
   indices/VIX/cross-asset/sector tape/rates (Treasury)/breadth (WSJ, fail-omit); render + escape/length
   asserts; hardened Telegram send; web page. → A useful, verdict-less note that never lies.
2. ✅ **Prose** (`5250ae7`): `write.ts` (Gemini) + `validate.ts` numeral token grammar (§8.2–8.3).
3. ✅ **The product** (`478e3a9`): `sp500_constituents` + migration 0022 + `seed/sp500-constituents.ts`;
   `divergence.ts` → within-sector divergence (§5) + index-contribution with reconciliation gate (§8).
4. ✅ **Depth**: `sources/gex-pin.ts` (real multi-expiry aggregation, pin = max|GEX| strike),
   `sources/fred-releases.ts` (printed releases + the forward calendar), `spotlight.ts` + settings UI
   (`/markets/notes/settings`, `/api/notes/spotlight`).

### Deployment checklist (operator)
- Apply every `drizzle/00{21,22,23,24,25,26,27}_*.sql` migration to Turso.
- Run `npx tsx scripts/seed/sp500-constituents.ts` once. **Refresh is automated** by
  `.github/workflows/seed-constituents.yml` (monthly), which alerts on failure — the staleness gate warns
  at 45d and drops every single-name section past 120d, so an unnoticed failure makes the note quietly
  smaller rather than loud.
- Secrets: see Environment variables (§3). `FINNHUB_API_KEY` is the one that is easy to forget and
  degrades silently.

---

## 11. Open items / decisions still needed

- **Econ-calendar access** — CLOSED. The free tiers of both FMP and Finnhub reject the economic calendar,
  so the FMP client was deleted and TELLS is now built from FRED's release calendar on the existing key.
  Consensus is unavailable and the note says so rather than implying one (v2 §I). The one piece FRED
  cannot supply is the FOMC meeting schedule — it dates release 101 every calendar day — so that is a
  static list in `fred-releases.ts`, deliberately shipped **empty** until the real dates are pasted from
  federalreserve.gov. Guessing them would be the exact fabrication §1a forbids.
- **Post time & cadence** — pinned to ≥6:15pm ET by the Treasury-feed dependency (§3/§8); confirm the exact
  cron + the poll-with-deadline window. Half-day handling specced (§7a).
- ~~**GEX symbol/scale**~~ — RESOLVED: reads **SPY** (Yahoo's index-option coverage is unreliable) and
  prints the symbol explicitly, so ETF-scale levels are never confused with SPX. "Pin" = max |GEX| strike
  within ±10% of spot. Note `yahooFinance.options()` returns only the FRONT chain — aggregating expiries
  requires an explicit per-date fetch, and each must be priced at its own dte (gamma scales ~1/√T).
- **LLM provider** — Gemini (wired) vs Claude for prose; A/B the voice.
- **Constituent dataset refresh** — cadence + source of truth for S&P 500 membership/GICS/float weight.
  Flag: SSGA holdings-XLSX ToS/licensing for automated daily pulls (low-risk — only aggregates are
  republished — but confirm). The holdings URL already 301-redirects once
  (`…/etfs/library-content/…` → `…/intermediary/library-content/…`) — follow redirects; re-verify on breakage.
- **Backfill** — whether to generate historical web-archive notes.

## Changelog
- **rev 4 (R3 fixes — converged):** cross-asset now the **16:00 ET bar via intraday `chart()`** (a 6:15pm
  `quote()` catches the futures reopen, not the close) (§3/§4/§8, M-1); reconciliation tolerance quantified
  (≤0.10pp); §8.3 added percent-change / econ actual-consensus classes + rounding-accepting price tolerance;
  curve read declared LLM output + numeral-validated (§4/§8.2); index-contribution sample reworded to
  S&P-only scope (was Nasdaq, unsupported by SPY weights); tightened sample hook ≤120 chars; skip-alert must
  be sent by the gate script itself (exits 0) (§7a); SSGA ToS + holdings-URL 301-redirect flagged (§11);
  TELLS label noted as next-trading-day-dynamic.
- **rev 3 (R2 fixes):** Treasury feed timing → trigger ≥6:15pm ET + poll-with-deadline (§3/§8/§11);
  numeral validation reworked into a token grammar with typed/derived-fact classes + hook-never-drop
  fallback (§8.3); index-contribution now uses SPY float weights + reconciliation gate, not full market cap
  (§3/§8); session gate adds `marketState` + `parseTime` coercion (§7a); constituent seed URL corrected to
  the daily-holdings XLSX family (§3); Telegram helpers must be replaced (not wrapped) to expose
  `{ok, description, message_id}`, + 429 retry + failure alert (§2); banned pseudo-McClellan + added WSJ
  asOf staleness check (§1a); sector-tape downgraded ✅→⚙; sample fixed (Fri Aug 7 real date; softened
  "flattened hard"; breadth-consistent bear line; feed-dependency asterisks); GEX SPX symbol flagged (§11).
- **rev 2 (R1 fixes):** corrected false ✅ (rates via Treasury not FRED; breadth source-gating; no
  constituent/GICS dataset; GEX has no pin; VIX partly exists; sector module citation). Added §1a
  data-integrity, §7a session/timezone gate, numeral-validation step, Telegram hardening + full-text
  escaping, runner pinning + limiter coordination, index-contribution fact, build order. Confirmed DB =
  Turso/libsql SQLite.
