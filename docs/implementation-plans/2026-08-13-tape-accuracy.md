# Tape accuracy — THE BOOK, release context, forward tells

Status: **ALL PARTS SHIPPED.** Part A and C1 on 2026-08-13; Parts B, C2, D and E on
2026-08-14.
Date: 2026-08-13, revised 2026-08-14 after consensus data was found to exist.
Converged after four adversarial review rounds.

Two items are deliberately NOT built and should stay that way until the conditions change:
**D4's rendering** (the table collects; nothing reads it until the sample is worth a second
look) and **GDP consensus** (excluded until one advance day has been observed).

Two things need you rather than code: a `HEALTHCHECK_PING_URL` secret for the dead-man's
switch — the workflow already passes it and skips the ping silently while unset — and
`drizzle/0036_connector_health_and_macro_surprise.sql` applied to Turso.

Fixes the daily note at `/markets/notes/[date]` so the positioning read is correct, the
release block says what a print means against what the street expected, the forward
calendar stops being a bare list, and a dead connector reaches a human.

Governing constraints, none of which this plan may break:

| | |
|---|---|
| §1a | A section whose feed failed is `null` and is omitted. Never approximated. |
| §1b | The model may not attach a cause to a named instrument. |
| §8.3 / §H0.1 | Every new numeral must be registered in `collectAllowedNumbers`, or prose citing it is dropped. |
| §H0.2 | Every new deterministic clause needs a degradation-ladder rung — the push has a 4,096-character cap. |
| ~~§I~~ | ~~No consensus feed exists.~~ **REVERSED 2026-08-14 — see §0 M9. A free one does exist.** |
| — | Facts are stored as JSON per session and re-rendered months later. |
| — | Job budget ~12 minutes. |

**§1a is not weakened by Part E.** Silence on the PAGE stays absolute: a failed feed is
still omitted, never approximated. Part E adds a second, separate channel — the operator
gets told. The reader still gets nothing rather than a guess.

---

## §0 Measurements

Everything below was measured against the live SPY chain and live FRED metadata on
2026-08-13, not argued from theory.

**M1 — the gamma sign is backwards in production.** Under the published call-minus-put
convention, total dealer gamma is **+0.82B, net LONG**. The page says "net short gamma".
`gex.ts:104-121` negates the standard form.

**M2 — the flip is a pure negation.** `old = Σput − Σcall = −new`, per strike and in
total. `|totalGex|` is invariant, so the selected pin strike is identical under either
convention. Only the label flips. This is what makes a retroactive correction exact.

**M3 — the implied-volatility fallback is dormant on the measured day.** Across 2,617
options with open interest over 10 expiries: **0** missing or zero implied volatility, 55
outside 3%–150%, and **none of those 55 within 10% of spot** (the pin band) or materially
inside the ±20% bisection band. Pin is 775 and the zero-gamma root 769.3 under every
variant — fallback or clamp, 3 or 10 expiries, ±5% / ±10% / ±20% band. One day is not a
distribution; the guard stays, but it is not a precondition.

**M4 — `EXPIRIES = 3` is the largest measurable error in the module.**

| expiry | dte | open interest | gamma |
|---|---|---|---|
| 2026-08-14 | 1 | 1,137,930 | +0.55B |
| 2026-08-17 | 4 | 131,229 | −0.03B |
| 2026-08-18 | 5 | 54,314 | +0.00B |
| *window ends* | | | |
| **2026-08-21 (monthly)** | 8 | **3,520,857** | **+0.29B** |
| 2026-09-18 (monthly) | 36 | 3,842,013 | +0.01B |

SPY expires daily, so three expiries is a three-calendar-day book. It excludes the monthly
expiration, where the structural book sits.

| window | fetches | share of ≤60d gamma | net gamma | zero-gamma |
|---|---|---|---|---|
| 3 expiries (today) | 3 | 57% | +0.53B | 769.88 |
| dte ≤ 30 | 11 | 87% | +0.81B | 769.37 |
| **dte ≤ 45** | **13** | **88%** | **+0.82B** | **769.47** |
| dte ≤ 60 | 14 | 100% | +0.93B | 769.01 |

Net gamma swings 55% between the current window and a real one. Same sign today; near a
flip, not necessarily.

**M5 — the zero-gamma level is stable.** 769.3–769.9 SPY across every band, every clamp
setting, and every horizon in the table above — including the horizon that moves net gamma
by 55%. So today's honest reading is: *long gamma, pinned toward 7,775, flipping negative
below roughly 7,715.*

**M6 — FRED metadata.** `PPIFID` is **NSA**; `PPIFIS` is its SA twin. The shipped PPI
headline is therefore on the correct published basis — no headline bug — but it carries
the same short-horizon trap as `CPIAUCNS`. Verified SA: `CPIAUCSL`, `PPIFIS`, `RSAFS`,
`PCEPILFE`, `ICSA`, `IC4WSA`.

**M7 — `IC4WSA` exists** (SA, weekly, "4-Week Moving Average of Initial Claims"). Fetch it
rather than compute it.

**M9 — a free consensus feed exists, and §I is wrong.**

`https://api.nasdaq.com/api/calendar/economicevents?date=YYYY-MM-DD`. No key, no auth.
Returns `eventName`, `gmt`, `actual`, `consensus`, `previous`, `description` per event.
The description bodies link to investing.com, so Nasdaq is reselling Investing.com's
calendar — which is *a* survey median, not *the* street number, and must be attributed.

Confirmed working, measured 2026-08-14:

- **Consensus is published BEFORE the release.** July retail sales, 8:30 ET 14 August:
  consensus +0.1% headline, +0.2% core, `actual` still blank.
- **History carries consensus too**, which is what makes a reaction study possible.
  Sampled 2026-07-15, 2026-06-11, 2026-03-12: each returns 8-9 US events with both
  `actual` and `consensus`.
- The paid alternatives remain paid: Trading Economics has discontinued the guest
  account; FMP returns "Invalid API KEY".

**M10 — Nasdaq's date field is the true ET release date PLUS ONE.** Verified against FRED
on four consecutive releases with no exceptions:

| Release | FRED release date | Nasdaq bucket |
|---|---|---|
| CPI (10) | 2026-08-12 | 2026-08-13 |
| PPI (46) | 2026-08-13 | 2026-08-14 |
| Jobless claims (180) | 2026-08-13 | 2026-08-14 |
| Retail sales (9) | 2026-08-14 | 2026-08-15 |

Retail sales lands in the Saturday bucket, which is proof on its own that the field is not
a release date. Query `trueDate + 1`.

**M11 — event names are ambiguous and carry no discriminator.** "CPI" appears twice at
8:30 with identical `eventName`, `gmt` and `country`: one row is m/m (0.1%), the other y/y
(3.4%). The full row has only seven keys and none separates them. The `previous` field
does: CPI y/y prior is 3.5%, m/m prior is −0.4%, and FRED already gives us the prior.

**M12 — the forward horizon is about one session, not a week.** Consensus is populated for
today's print and blank four days out (18 August Empire State, 26 August PCE and GDP all
return empty). Enough for "next session's tells"; not enough for a week-ahead view. The
exact cutover needs several nights of observation, which is why Part E logs it.

**M13 — the join is EXACT, and the vintage runs the opposite way to the obvious fear.**

Review round 3 called the join a blocker: FRED's prior is the current vintage (the file
documents that it cannot transform across vintages), while Nasdaq's `previous` was assumed
to be as-first-published, so the two would disagree exactly on revision days. Measured, on
2026-08-14, that is wrong in both halves.

*Nasdaq carries the CURRENT vintage, not the first print:*

| | value |
|---|---|
| Nasdaq "Initial Jobless Claims" prior (bucket 08-14, true 08-13) | **200K** |
| FRED ICSA, week of 2026-08-01, **first published** 2026-08-06 | 199,000 |
| FRED ICSA, week of 2026-08-01, **current vintage** | **200,000** |

The prior is revised at the same release that publishes the new figure, so the number the
calendar shows as "previous" is the revised one — which is exactly what `latestTwo()`
already returns and already displays as "prior". Claims revise almost every week, so this
is the hardest case, not the easiest.

*And every value matches to the displayed precision:*

| Nasdaq row | actual / prev | FRED series + transform | actual / prev |
|---|---|---|---|
| CPI (y/y) | 3.4% / 3.5% | `CPIAUCNS` `pc1` | 3.4% / 3.5% |
| CPI (m/m) | 0.1% / −0.4% | `CPIAUCSL` `pch` | 0.1% / −0.4% |
| PPI (y/y) | 4.7% / 5.5% | `PPIFID` `pc1` | 4.7% / 5.5% |
| Initial Jobless Claims | 209K / 200K | `ICSA` `lin` | 209,000 / 200,000 |

Four for four, on both fields.

**The SA/NSA split is what disambiguates M11's duplicate names, and it is principled rather
than a heuristic.** The two rows both called "CPI" are not arbitrary: BLS publishes the
monthly change seasonally adjusted and the annual change unadjusted, so Nasdaq's m/m row is
`CPIAUCSL` and its y/y row is `CPIAUCNS`. Each of our specs names one series and one
transform, so its own prior matches exactly one of the two rows. No nearest-match margin, no
tolerance tuning.

*The escape hatch the review proposed does not exist:* the `description` field contains no
URL and no Investing.com event id. It is 410 characters of prose with the links stripped.

*What this does NOT make safe:* a **backfill** join. A historical row's `previous` is that
day's vintage, while FRED's current vintage has moved under annual seasonal revisions. The
live path joins same-day and is sound; the historical path is not, which is one of two
reasons D4's backfill is cut below.

**M14 — payrolls, the worst case for revisions, also matches exactly.** Nasdaq bucket
2026-08-08 (true ET 2026-08-07, the Employment Situation):

| Nasdaq row | actual / cons / prev | FRED | actual / prev |
|---|---|---|---|
| Nonfarm Payrolls | −23K / 85K / 20K | `PAYEMS` `chg` | −23.0 / 20.0 |
| Unemployment Rate | 4.1% / 4.2% / 4.2% | `UNRATE` `lin` | 4.1 / 4.2 |

Two things this settles beyond M13:

1. **The general join rule is the PRIOR VALUE, not seasonal adjustment.** M13's SA/NSA
   observation explains *why* CPI's two identically-named rows carry different numbers; it
   is not the mechanism. The mechanism is that each spec's prior matches exactly one row.
   Payrolls and the unemployment rate have unique names and need no disambiguation at all,
   and Nasdaq labels its own y/y variants explicitly where it bothers to
   ("Average Hourly Earnings (YoY)"). CPI, PPI and retail sales are the exceptions, not the
   rule.
2. **The residual ambiguity is narrow and already handled.** Two rows collide only if they
   share a name *and* a prior value — m/m and y/y priors would have to be equal. Measured
   spreads: CPI −0.4 vs 3.5, PPI −0.1 vs 5.5, retail sales 0.2 vs 6.72. When it does happen,
   D2's rule already says: ambiguous means no consensus.

Incidentally the payrolls print was −23K against an 85K consensus — a 108K miss, and the
kind of sentence the note has never been able to write.

**M15 — the retail-sales collision does not occur, but the rule does not rely on that.**
The review's sharpest worry was two same-transform m/m rows both named "Retail Sales".
The bucket for 2026-08-15 holds six retail-family rows and the core one is named
distinctly:

| eventName | consensus | previous |
|---|---|---|
| `Core Retail Sales` | 0.2% | −0.2% |
| `Retail Control` | — | 0.5% |
| `Retail Sales` | 0.1% | **0.2%** |
| `Retail Sales` | — | 6.72% |
| `Retail Sales Ex Gas/Autos` | — | 0.4% |
| `Retail Inventories Ex Auto` | — | −0.2% |

`RSAFS` `pch` prior is 0.2%, so exactly one row matches. The two rows sharing the name
"Retail Sales" are m/m and y/y with priors 0.2% and 6.72% — far apart.

This is one payload on one day. D2's unique-match rule is what makes the design correct
when a future payload is not this tidy.

**M8 — `/api/markets/gex` has no consumer in this repo.** Nothing imports it, no component
fetches it. It is the sole caller of `interpretGex`, `formatGex`, `flipZone` and
`maxPainStrike`. *(It is an authenticated HTTP route, so an external caller cannot be ruled
out by grep — confirm before deleting.)*

---

## Part A — THE BOOK

### A1 · Correct the dealer sign

`gex.ts:78-85` is not an alternative convention. Its prose says dealers are short calls
*and* short puts, then the code adds put gamma positively. It is a sign error with a
narrative attached.

1. `calculateGex` becomes `totalGex = callGex − putGex`, calls positive.
2. Ship the corrected meaning under a **new field**, `GexPinData.dealerGammaSign: 1 | -1`.
   Leave the legacy `netGammaPositive` untouched on stored notes. Presence of the new field
   means the new meaning — no default semantics to misread.
3. State the assumption on every note: *"assuming dealers are long calls and short puts —
   the usual customer book."* It is an assumption. The trade-side data that would settle it
   is paid.

### A2 · Say "pin" or "trigger" from the sign at that strike

Net gamma can be positive while the heaviest strike is put-dominated, so the test is the
sign **at the strike**, not the net.

- gamma at strike > 0 → *"a pin near X"* — price is drawn toward it
- gamma at strike < 0 → *"a trigger near X"* — hedging accelerates through it

Carry signed `pinGex` on `GexPinData`.

### A3 · Widen the expiry horizon to dte ≤ 45

Replace `EXPIRIES = 3` with a fixed dated window. ~13 sequential fetches instead of 3, a
few seconds against a 12-minute budget.

**Fixed, not anchored to the monthly expiration.** An OPEX-anchored window has a sawtooth
width — ~31 days the day after expiration, ~1 day the day before — so net gamma would move
with the window rather than with the book, and A5's delta clause would read the sawtooth as
flow. "The book flipped" would fire around every expiration as an artifact. A fixed window
rolls smoothly and means the same thing on every archived note.

Store `horizonDays` on `GexPinData` and state it on the page: *"across expirations through
26 September."*

### A4 · Drop absurd implied volatilities

Delete the `|| 0.3` fallback at `gex-pin.ts:78`. Drop any option whose implied volatility
is outside 3%–150%, exactly as `oi <= 0` is already dropped at `gex-pin.ts:76-77`.

M3 says this changes no output today. Inventing a volatility under a §1a regime is still
indefensible, and **it must ship in the same release as A3** — widening the horizon pulls
in longer-dated chains, which is where Yahoo's implied-volatility hygiene is worst.

### A5 · The zero-gamma level

The spot price at which total dealer gamma is zero. `calculateGex`'s existing `flipZone` is
not this: it cumulates per-strike totals from the lowest strike, which is an open-interest
artefact. Gamma is a function of spot, so it must be **re-priced** at each candidate.

```
f(S) = Σ  sign · Γ(S, K, T, σ) · OI            sign = +1 call, −1 put
```

Three rules the first draft got wrong:

1. **Per-expiry T.** `gex-pin.ts:59-67` exists because gamma scales ~1/√T. The signature
   takes `{strike, oi, iv, sign, T}[]`, never one shared dte.
2. **Bracket against spot, not across the whole band.** Bisect `[0.8·spot, spot]` and
   `[spot, 1.2·spot]` separately and report the **nearest** crossing. A single
   endpoint-to-endpoint test misses the case where a root sits on each side of spot, and the
   rendered claim is about the nearest boundary, not about *a* root somewhere.
3. **Direction from `sign(f(spot))`**, never assumed. No crossing found means *no crossing
   detected in the band* — word it that way or say nothing (§1a).

The `·100·S` dollar-gamma multiplier is omitted deliberately: `S > 0` across the band, so
every positive-scalar variant has the identical root, and no magnitude is displayed.

Cost: ~40 × 2,600 Black-Scholes evaluations. Milliseconds, no fetch.

**Log pin and zero-gamma under each variant for the first two weeks.** M5 is one day.
Treat stability as a hypothesis under review, the way the §A relevance coefficients are.

### A6 · Day-over-day delta

The only genuine flow read these sources allow. `gexPin` is already persisted;
`weekly-review.ts` already walks the sequence; nothing reads the delta.

```
GexPinData.prior?: { date, pinStrike, dealerGammaSign, zeroGamma | null }
```

**Compare on SPY strikes; convert only for display.** The index equivalent divides by each
day's own SPX/SPY ratio and rounds to 5 points, so an index-scale delta can manufacture or
hide a roll from ratio drift alone while the SPY strike is unchanged. Decide "unchanged"
before converting.

Guards — all required, or `prior` is omitted:

- same `symbol`
- prior note carries `dealerGammaSign` (never compares across the A1 fix)
- **same `horizonDays`** (never compares a 3-day book against a 45-day one — M4 says that
  differs by 55%)
- prior date within 4 sessions (reuse `fetchPriorSessionDate`'s rule, `assemble.ts:590-593`)

Known and accepted: day N stores a copy of day N−1's figures, so regenerating N−1 afterwards
leaves the snapshot stale. The push is composed at assemble time and needs the delta then.

### A7 · Legacy notes carry a section-scoped correction

M2 proves the mapping is a lossless negation, so the correction is exact and stays exact.

Render it **adjacent to THE BOOK on every archived note** lacking `dealerGammaSign`, never
once in a footer — readers land on one day's page. This follows the repo's own rule at
`CalendarSection.tsx:54-55`: the caveat travels with the figure.

It must scope the **section**, not the sentence. `render.ts:388-402` dropped any model book
line that contradicted the stored stance, so archived prose was *selected to agree with the
inverted sign*. Wording:

> This note's positioning read was written under an inverted dealer-side assumption. The
> corrected stance is the opposite.

### A8 · Delete `/api/markets/gex`

M8: no consumer. It serves a wrong `flipZone`, a `maxPainStrike` that is actually
highest-OI (and O(n²) at `gex.ts:134-145`), and the inverted sign. Fixing dead code is
maintenance for nobody.

Delete the route, then delete `flipZone`, `maxPainStrike`, `interpretGex` and `formatGex`
from `gex.ts` if nothing else calls them — leaving known-wrong outputs invites a future
caller to trust them. **Confirm no external caller first.**

### A9 · Reword the start-of-day caveat

It is correct but reads as a larger disclaimer than it is for a post-close daily. New
wording states the horizon (A3) and what the figure can and cannot see.

### Out of scope

Intraday gamma. Yahoo cannot support it. That needs CBOE or OCC end-of-day series files, or
a vendor.

---

## Part B — "Data released today"

**Revised 2026-08-14.** M9 changes what this section leads with. The plan's original
answer to "what does this print mean" was a deterministic series context, built because
consensus was believed unavailable. Consensus IS available, and *actual against
expectation* is what a reader actually wants. The series context stays, demoted to the
second line — it is still the thing that survives when the consensus feed is down, and
under §1a that matters more than usual.

Order on the page: **surprise first, context second, rank last.**

### B1 · Context is per-series

| Release | Headline series | Context |
|---|---|---|
| CPI y/y | CPIAUCNS (NSA) | 3m + 6m annualized **from CPIAUCSL** |
| PPI y/y | PPIFID (NSA) | 3m + 6m annualized **from PPIFIS** |
| Core PCE y/y | PCEPILFE (SA) | 3m + 6m annualized |
| Retail sales m/m | RSAFS (SA) | 3m average m/m |
| Payrolls | PAYEMS (SA) | 3m average monthly change |
| Unemployment | UNRATE (SA) | change vs 3m and 12m ago; 12m low/high |
| Jobless claims | ICSA (SA) | **fetch IC4WSA** (M7) — no arithmetic |
| GDP q/q ann. | A191RL1Q225SBEA | prior two quarters, listed |

`ReleaseSpec` gains `contextSeriesId?: string` and `contextKind`.

**Do not break GDP.** `maxAgeDays: 130` at `fred-releases.ts:68` is what restricts GDP to
the advance estimate, which the hard-coded "(advance)" label depends on.

### B2 · The seasonal-adjustment trap

A 3-month annualized rate computed from an NSA series is seasonality, not signal. Over
twelve months it cancels, which is exactly why the headline y/y is correct on NSA. **Two**
headline series are NSA (M6) and both need their SA twin for short-horizon arithmetic.

### B3 · Rank and range

Report a rank only when the print is a strict extreme of its window, or the "since" date is
at least 6 periods back. Otherwise it is noise in the shape of a finding.

Lookback is **per frequency**: 24 months monthly, 52 weeks weekly, 8 quarters quarterly.
Say "twelve-month high", never "cycle high" — a 12-month range is not a cycle.

### B4 · Store typed data, never rendered strings

Seasonal factors are re-estimated annually, so re-fetching FRED months later will not
reproduce a stored "3.1% 3m annualized". A frozen sentence is un-auditable, it freezes
phrasing forever, and it breaks the existing pattern — `MacroRelease` stores
`actual/prior/dp/suffix` and `CalendarSection.tsx:18-19` formats.

```ts
MacroRelease.context?: {
  kind: "annualized" | "average" | "level-change" | "published-average" | "rank"
  value: number
  windowPeriods: number
  seriesId: string          // usually the SA twin
  inputPeriods: string[]    // the observation dates it came from
  extreme?: "high" | "low"  // rank only
  sinceDate?: string        // rank only — "the fastest since February 2025"
}[]
```

`extreme` and `sinceDate` are the entire content of a rank claim. Without them B3 collapses
back into strings.

### B5 · Registration (§H0.1)

Every `context[].value`, A5's zero-gamma level and A6's prior pin must be pushed in
`collectAllowedNumbers` (`validate.ts:57-63`), or any bullet citing them is silently
dropped.

Two details:

- **Mirror the k-suffix scaling** at `validate.ts:73-77`. `IC4WSA` renders as "231k", so
  pool both forms, exactly as ICSA's actual and prior already are.
- **Keep the fact sheet on SPY scale.** The index-converted 7,715 is renderer-owned and
  unpooled. If `write.ts`'s Positioning line ever showed index-scale figures, the model
  would cite numerals the validator must drop.

### B6 · Ladder rungs (§H0.2)

`render.ts` has a monotonic ladder asserted by test. Every new deterministic clause needs a
rung, ordered below existing content.

### B7 · What must never be said

"Hotter than expected", "a miss", "a beat" — all relative to a consensus we do not have. No
causal link to the day's tape (§1b).

### B8 · Cost

One extra FRED call per printed release. Most sessions zero or one; payrolls day, two.

---

## Part C — "Next session's tells"

`CalendarSection.tsx:78` is a hard-coded intro, and it is accurate today.

### C1 · FOMC — first

`FOMC_DECISIONS` is an empty array, so the largest scheduled event of any month never
appears. A note silent in an FOMC week fails its reader worse than any gamma nuance. Eight
dates a year.

**Sourced and verified, never guessed** — the file's own comment is right that a wrong FOMC
date is the worst error this note can make. Fetch from federalreserve.gov; you confirm
before it ships.

Two bugs block it:

- `fred-releases.ts:211` sorts `date + timeEt` lexicographically, so `"14:00"` sorts before
  `"8:30"`. Every current spec is 8:30 so it does not bite today; FOMC at 14:00 makes it
  bite. Zero-pad or compare numerically.
- `:213` caps the list at 4. Exempt FOMC.

### C2 · The expectation, then the fallback threshold

**Revised 2026-08-14.** The twelve-month-range threshold was the honest substitute for a
consensus we thought we could not get. Now it is the FALLBACK, and the consensus leads:

> Retail sales, Friday 8:30 ET. Street looks for +0.1% m/m against +0.2% last.

When the consensus is missing (M12 says it will be, more than one session out), the
original threshold line stands in unchanged:

> PPI, Thursday 8:30 ET. Last printed 3.1% y/y, inside a 2.1–3.4% twelve-month range.
> Above 3.4% would be a twelve-month high.

Typed fields on `EconEvent`, same reasoning as B4. Registered per B5.

### Cut

**Static per-release briefs.** The draft's own example was wrong — it attached "the rate the
Fed targets" to core PCE, and the FOMC's 2% objective is on headline PCE. If the example
errs at design time, a static table rots silently in production.

**LLM scenario prose.** Still cut, and M9 does not revive it. A sourced consensus makes the
*surprise* a fact; it does not make the *consequence* one. The model would still write "if
PPI comes in hot, the front end sells off", which is a forecast wearing a number. Part D
gives the measured version. Add the ban to `RULES` in `write.ts` regardless: no *hot, cool,
beat, miss* — and no conditional-consequence construction at all.

Also cut: retail-sales 3m annualized, GDP 4-quarter average.

---

## Part D — Consensus, and what a miss has historically done

New in the 2026-08-14 revision. Answers the question the note has never been able to
answer: what does the street expect, and what has happened when the print disagreed.

### D1 · The connector

`nasdaq-calendar.ts`, one module, mirroring `fred-releases.ts` in shape.

- Query `trueEtDate + 1` (M10). Named constant, with M10's table in the comment, because
  it is the kind of thing a future reader will "fix".
- Filter `country === "United States"`.
- `actual`, `consensus` and `previous` arrive as display strings ("0.1%", "209K",
  "1,777K", or the literal `&nbsp;`). Parse to numbers; treat `&nbsp;`, empty and
  unparseable alike as absent.
- **Browser `User-Agent` and `Accept` headers, and a per-call `AbortController` timeout
  (10s), plus a total Nasdaq time cap.** The endpoint is known to hang rather than 403 on
  bare requests from datacentre IPs, and GitHub runners are the canonical blocked class. A
  consensus that never arrives must cost the consensus line, never the 12-minute budget.
  Nothing in `assemble.ts` carries a timeout today; this connector does not inherit that.
- Cache per date within a run.

### D2 · The join is on `previous`, and M13 shows it is exact

M11: two rows are both called "CPI" at the same minute, one m/m and one y/y, with no
discriminating field. The name alone cannot resolve them and never will.

Each `ReleaseSpec` gains `nasdaqEventName`. **The operative rule is unique match:** scan
*every* row whose name matches, and require that **exactly one** has a `previous` equal to
FRED's own prior for that spec. Zero matches or two matches means no consensus for that
spec. Never first-match-wins.

That rule is what makes the design safe, and it does not depend on any publishing
convention being true. Under it, every ambiguity degrades to prior-only — which §1a already
licenses — instead of mis-joining.

Comparison detail worth one sentence, because it is a unit bug waiting to happen: compare
**rounded-to-`dp` against rounded-to-`dp`**, through the same
`Math.round(v * 10**dp) / 10**dp` the spec already applies, and apply the spec's `scale`
first (`ICSA` carries ×1e-3, so "200K" is 200 and FRED's 200,000 is 200). Never float
equality on parsed values.

M13 and M14 measured this end to end: exact on six series, on both `actual` and `previous`,
including the two hardest cases — claims (revised almost every week) and payrolls (revised
by ±50-100K against a prior of similar size). Two properties make it work, and both belong
in the code because neither is obvious:

1. **Nasdaq's `previous` is the CURRENT vintage.** The prior is revised by the same release
   that publishes the new figure, so the calendar's "previous" is the revised one — which
   is exactly what `latestTwo()` already returns.
2. **The prior VALUE is the discriminator**, not the name and not seasonal adjustment. Most
   rows have unique names and need no disambiguation; Nasdaq labels its own y/y variants
   where it bothers ("Average Hourly Earnings (YoY)"). CPI, PPI and retail sales are the
   exceptions, and their two rows carry priors far apart (M14, M15).

The SA/NSA convention (M13) is **not** the mechanism — it is only the reason CPI and PPI
are *guaranteed* safe. It is a BLS price-release convention and it does not extend to BEA
or Census. Core PCE's m/m and y/y rows both derive from the same seasonally adjusted index,
so they are separated by magnitude alone (~0.2% against ~2.7%), which is an accident rather
than a rule. That is exactly why the operative rule is unique match and not "trust the
convention".

### D2a · Transcribe the event names before enabling a spec

`nasdaqEventName` values are **observed from a real payload on a real release day, never
guessed** — the same discipline `FOMC_DECISIONS` already mandates. A guessed name silently
yields zero matches forever, which is invisible without the join-health signal in E6.

**GDP is excluded from consensus until one advance day has been observed.** Its structural
hazard is unique: the annual NIPA revision lands *with* the Q2 advance every July and moves
FRED's prior in the same release. The same-release-revision mechanism predicts a match, but
that is a prediction extrapolated from claims, and GDP advance days come four times a year
with no chance to learn quietly. Observe one, then enable it.

**Runtime invariant, because M10's offset is an accident of Nasdaq's pipeline and not a
contract.** Deriving the true date from the row's own `gmt` field does not work — `gmt`
carries a time and no date, so it cannot say which day a row belongs to. Instead: on any
session where FRED says a tracked release printed, assert the `trueDate + 1` bucket
contains at least one name-match. Zero matches on such a day means the bucket convention
moved, and the connector reports `degraded` with that reason so Part E surfaces it the same
evening.

### D3 · What the page may say

A sourced expectation makes exactly one new claim true — that the print differed from what
was surveyed:

> Retail sales +0.1% m/m, against a +0.3% consensus and +0.2% last.

Attribution is mandatory and goes in the section's provenance line, not a footnote:
**"Investing.com survey median, via Nasdaq."** It is one survey's median. The figure you
have from another desk will differ, and the note must not imply a single street number
exists.

Permitted: *above / below / in line with consensus*. Banned: *beat, miss, hot, cool,
hawkish, dovish* — each imports a market interpretation that the number alone does not
carry.

### D4 · The reaction study — COLLECT NOW, PRINT NOTHING YET

The draft proposed rendering a median reaction ("the 9 above consensus moved the 10Y a
median +4bp"). **That is cut.** Three arguments killed it, and I accept all three:

1. **The "measured, not forecast" distinction does not survive a reader.** It will be read
   as a playbook every time. A number whose chief documented risk is being over-read has no
   place in a note whose entire ethos is refusing to imply what it cannot support.
2. **It is noise at this N.** Daily 10Y changes have a standard deviation around 5-7bp. A
   +4bp median over 9 observations with a range spanning zero is not distinguishable from
   no effect — before the confound that close-to-close contains the whole day.
3. **The backfill join is not sound anyway.** M13 shows the live join is exact because
   Nasdaq's `previous` is the current vintage *on release day*. A historical row's
   `previous` is that day's vintage, and FRED's has since moved under annual seasonal
   revisions. So the very step that would populate the study is the one step M13 does not
   validate.

**What is built instead — collection only, no rendering:**

```
macro_surprise_history(
  release_id, series_id, release_date,          -- unique key
  consensus, actual, prior,
  surprise,                -- actual − consensus, in the series' own units
  spy_pct, tnx_bp, vix_chg,
  measured_as,             -- 'close-to-close' | 'intraday-0830-1000'
  consensus_captured       -- 'same-day' | 'backfill', so vintages never silently mix
)
```

One row appended nightly per release that printed, with the consensus captured the same
evening — which is the only vintage M13 validates.

**And one thing the draft missed: capture the intraday window forward, starting now.**
Yahoo retains 5-minute bars for about 60 days, so the backfill *cannot* have them — but
the nightly job *can*, at zero marginal cost, for that day's print. Two years from now
there is a defensible 8:30→10:00 study. Today there is nothing worth printing, and printing
nothing is this product's stated policy.

**No backfill script.** It would be ~192 Nasdaq calls to populate a column the join cannot
be trusted to fill.

Revisit when the table holds enough same-day rows to be worth a second look. If it is ever
rendered, report **sign consistency** ("the 10Y rose in 8 of the 9 above-consensus prints")
rather than a median of a fat-tailed nine, with a consistency floor around 75%.

### D5 · Storage, registration and the ladder

**A stored consensus needs its own capture time.** Survey medians drift as forecasters
submit, so the median at 18:15 ET on release day is not the median at T−3, and a note
re-rendered months later must be able to say which one it quoted. `Fact.asOf` already
establishes the convention; apply it at field level on the consensus.

**§H0.1 registration.** Consensus and the rendered surprise are new numerals in
`collectAllowedNumbers`. Pool the **displayed** surprise in display units, not just
`actual − consensus` in raw units — a bullet saying "0.2pp below consensus" cites the
former. Mirror the k-suffix scaling that ICSA's actual and prior already have
(`validate.ts:73-77`).

**§H0.2 rungs**, and specify the residual form for each: when the macro line is trimmed,
does it keep "3.4% vs 3.3% cons" or fall back to prior-only? Prior-only, because the
consensus is the part with an external dependency.

**One stale comment to delete:** `validate.ts:64-65` says "econEvents contribute no
numerals". C2 makes that false.

### D6 · Every "no consensus" claim in the codebase must change in the SAME release

Missed entirely by the first revision, and it would have shipped a note whose own basis
line denies the number printed above it. Enumerated:

| File | What it says |
|---|---|
| `render.ts:239` | prints `" (vs prior — no consensus feed)"` into the push |
| `render.ts:216-217` | the comment justifying it |
| `write.ts:117` | tells the model "no consensus feed is available" |
| `write.ts:150` | "no consensus is available, so do not imply one" |
| `fred-releases.ts:291, 295` | `source: "... (no consensus available)"` — **persisted into every stored note** |
| `fred-releases.ts:364, 409` | same, for the released-today fact |
| `fred-releases.ts:5-7, 252` | module docs |
| `types.ts:135-136, 244` | `MacroRelease` and `EconEvent` doc comments |
| `CalendarSection.tsx:27` | "no free feed carries consensus, so calling a gap a miss would be untrue" |
| `CalendarSection.tsx:78` | "No consensus and no prior — the event and its time are the whole claim" |

All become conditional on whether a consensus was actually obtained.

**Key the condition off the PRESENCE of consensus in the stored data, never off a date
cutoff.** `CalendarSection.tsx` renders the archive page from stored `facts`, not from the
persisted `webBody` — so the new component code renders old notes. Presence-keying makes
those render prior-only automatically, which is correct by construction. Archived `source`
strings are untouched: they were true when written, the same principle that governs the
gamma-sign correction in Part A.

**And the fallback must assert the BASIS, not the world.** This is the trap in the whole
change. `CalendarSection.tsx:27` currently says "no free feed carries consensus" — a claim
about the world, now false, and new code will render it onto old notes. The consensus-absent
branch says *"measured against the prior reading"* and stops there: true of the data in
front of it, and true forever. Same rule for `render.ts:239`'s degraded basis string. A
fallback that explains why a number is missing by denying the number exists is a freshly
false sentence, not a caveat.

The spec itself: **`docs/daily-note-v2-spec.md` §I** (line 736), not `daily-note-spec.md`
as the first revision wrote. Record M9-M15 as the evidence for the reversal.

### D7 · The word ban must be a validator, not a prompt line

`RULES` in `write.ts` is advisory, and nothing else in this codebase trusts it — §1b's
causal check and the numeral pool are both default-deny validators for exactly that reason.

Add a banned-lexicon check beside `checkCausalRule` in `validate.ts`, applied in
`applyFallbacks` (`write.ts:303`), so a field saying "a hot CPI print" is **dropped**, not
merely discouraged: *beat, miss, hot, cool, hawkish, dovish*, and any
conditional-consequence construction. Keep the `RULES` line too — the prompt reduces how
often the validator has to fire.

### D8 · The risk, stated plainly

`api.nasdaq.com` is undocumented, unauthenticated, and not a contract. It can change shape,
start rate-limiting, or block a datacentre IP without notice, and GitHub Actions runners
are exactly the kind of IP that gets blocked. The codebase already depends on a scrape of
comparable standing — WSJ Markets Diary for breadth, behind a source gate — so this is not
a new class of dependency.

Two mitigations, both required:

- §1a governs the page: no consensus means the line reverts to prior-only. The section
  never degrades to a guess, and every claim it makes without consensus is one it already
  makes today.
- Part E governs the operator: a connector that stops answering raises an alert the same
  evening rather than being discovered months later in an archive.

---

## Part E — Connector health alerts

New in the 2026-08-14 revision, and the reason the rest of this plan is safe to depend on.

### E1 · The gap

`alertAdmin` exists (`src/lib/notes/telegram.ts:97`) and is wired to five call sites, all
of them pipeline-level: the session gate, missing indices, a missing chat id, and two
crash handlers. **No individual connector reports its own health.** Breadth, Treasury,
FRED, the options chain, SPDR holdings, Finnhub, EDGAR and now Nasdaq each degrade to
`null` and the note simply omits a section — correct for the reader, invisible to the
operator.

Two real cases already sitting in this repo prove the cost: `FOMC_DECISIONS` shipped empty
for months and nothing said so, and the gamma sign was inverted in production with no
signal of any kind. A third is latent — the overnight open-interest blank measured in the
Part A work would silently omit THE BOOK if it ever overlapped the job window.

### E2 · Shape

A `ConnectorHealth` record collected per connector, and one digest alert per run — never
one message per connector, which trains the operator to ignore them.

```
type ConnectorStatus = "ok" | "empty" | "skipped" | "degraded" | "down"

interface ConnectorHealth {
  name: string          // "FRED calendar", "Nasdaq consensus", "WSJ breadth", "SPY chain"
  status: ConnectorStatus
  detail?: string       // "HTTP 429", "0 of 13 chains carried open interest"
  itemsExpected?: number
  itemsGot?: number
}
```

**`empty` never alerts.** The distinction already exists as `fetchUpcomingReleases`'s
`answered` flag and it is the right one: "FRED answered and nothing is scheduled" is a
fact; "FRED never answered" is an outage.

**`skipped` never alerts either, and it is new.** Several sources run conditionally —
attribution only fires for ranked names, the prior-pin lookup needs a prior note — so on a
quiet day they make zero calls legitimately. Without this state, E5's registry check
false-alarms weekly, and a registry that cries wolf is dead within a month.

Two guards, or `skipped` becomes the hiding place for real failures:

1. **It is an explicit self-report with a mandatory reason, never a default and never a
   catch-all's label for an exception.** A connector that throws before reporting surfaces
   through the registry as missing, which is `degraded`.
2. **Cascade visibility.** Attribution legitimately skips when relevance ranked nothing —
   but if relevance ranked nothing *because sectors was down*, a digest showing one `down`
   and three silent skips understates the blast radius. On any run with a `degraded` or
   `down`, print the skipped entries with their reasons so the cascade reads as one story.
   On healthy runs they stay silent.

**Health is collected in a side channel, NOT on `StructuredFacts`.** The facts JSON is
persisted and re-rendered months later; embedding health would bloat every archived note
and put unregistered numerals next to the renderer.

**The real cost of E is not the digest — it is the refactor.** Roughly eight connectors
currently return a bare `null` for every failure mode. Each needs to return a *reason*
instead, or the digest can only ever say "down" where the interesting signal is
"answered, but its date was two days stale". That refactor is most of the work.

### E3 · The alert is edge-triggered, not nightly

The first draft sent a digest every night that anything was `degraded`. That is how the
digest gets ignored: the Part A work measured Yahoo returning zero open interest across a
whole chain overnight, and partial-OI expirations are routine, so "SPY chain — 4 of 13
expirations carried no open interest" would fire most nights. A three-week Nasdaq IP block
would be fifteen identical messages.

**Send on a status CHANGE, then on the 3rd consecutive session, then weekly. Silence in
between.**

Edge-triggering alone has a hole, and it is the shape Yahoo's overnight open-interest blank
actually takes: a connector that alternates down, ok, down, ok produces an edge *every*
night — `[NEW]`, then `RECOVERED`, then `[NEW]` — which is noisier than the nightly digest
it replaced. Two rules close it without any flap-detection machinery:

- **`down` alerts immediately. `degraded` alerts on the 2nd consecutive session.** A
  degradation that heals overnight is the one event the operator cannot act on — it is over
  before they read it — so suppressing it costs nothing. A first 403 from an IP block still
  lands the same evening.
- **RECOVERED fires only for a failure that was actually alerted.** Otherwise recovery
  re-introduces exactly the noise the first rule removed.

```
CONNECTORS — daily note 2026-08-14

DOWN
  Nasdaq consensus — HTTP 403 (3rd consecutive session)

DEGRADED
  WSJ breadth — answered, but dated 2026-08-12, expected 2026-08-14  [2nd session]
  SPY chain — 4 of 13 expirations carried no open interest  [2nd session]

RECOVERED
  Treasury — ok after 2 sessions down

SKIPPED (shown because this run has failures)
  Attribution — relevance ranked no names (sectors was down)

OK: FRED calendar, FRED releases, Yahoo quotes, SPDR holdings, Finnhub, EDGAR
```

A feed that answers with stale data is `degraded`, not `down` — it answered. The example
follows the taxonomy, because the example is what gets copied.

Recovery is an edge too, and it is the one that tells you a fix worked.

**A fully healthy run sends nothing.** No daily all-clear.

### E4 · Persistence: its own table, not a column on `daily_notes`

`connector_health(name, last_status, streak_count, last_run_date, last_alerted_date)`,
written unconditionally in the digest step.

**Not a JSON column on `daily_notes`.** `run-daily-note.ts:56-61` only writes a note row
after the session gate passes and indices exist — so the hardest failures, the ones with
the longest streaks, write no row at all, and the streak resets exactly when it matters.

### E5 · The registry, and the static-data horizon check

An explicit list of expected connectors. A run reporting health for fewer entries than the
registry holds is itself `degraded` — this catches a source that stops being *called*,
which no per-call error handler can see.

**And a registry entry for STATIC data, which closes E1's own wound.** `FOMC_DECISIONS`
shipping empty for months is the motivating example, and nothing in a liveness taxonomy
would ever have caught it — it is a hand-maintained array, not a connector. A hand-kept
list is a source whose "fetch" is a date comparison, so it belongs in the same registry and
the same digest, which is what guarantees anyone looks at it.

The list now runs to 2027-12-08. **`degraded` under 120 days of runway, escalating to
`down` under 30.** The Fed publishes the following year by mid-year, so 120 days is ample
notice — but a `degraded` that only reminds weekly can be snoozed for the whole four
months, and the 30-day step is what stops that.

### E6 · What E does NOT catch, stated so it is not oversold

- **Semantics.** The inverted gamma sign was a connector confidently returning the negation
  of the truth. No health taxonomy detects that. Only the bespoke validity gates do — the
  WSJ date check (`assemble.ts:295`), the sector count `!== 11` (`:142`), the chain
  coverage floor added in Part A. **E's job is to surface those gates' rejections** as
  `degraded`/`down` with a reason, not to invent new ones.
- **Join health.** Nasdaq answering `ok` while zero specs matched is total content loss with
  no signal. Use `itemsExpected` (specs FRED scheduled today) against `itemsGot` (specs that
  acquired a consensus). Same treatment for the FRED staleness path at
  `fred-releases.ts:383-390`, which drops a scheduled release with only a `logger.warn`.
- **Hangs.** Nothing in `assemble.ts` carries a timeout. A connector that never resolves
  stalls the pipeline and no digest is ever composed. **Per-connector timeouts are a
  precondition for `down` being detectable at all**, not a refinement.
- **The job not running — and this one needs a switch OUTSIDE GitHub.** The largest
  connector is the pipeline itself, and nothing watches it. GitHub disables scheduled
  workflows after 60 days of repository inactivity, and a disabled cron sends nothing at
  all.

  The draft proposed the weekly wrap as the watchdog. That is wrong on its own terms: the
  wrap is a scheduled workflow **in the same repository**, so an Actions outage, a billing
  lapse, or the 60-day disable kills the note and its watchdog together. The switch is dead
  exactly when it is needed.

  **Use an external dead-man's ping** — the daily job pings a healthchecks.io-style URL on
  success, and the service alerts when a ping does not arrive. Free tier, one URL, one
  `fetch`, and it is the only mechanism here that survives the whole repository going dark.
  If an external dependency is unacceptable, keep the weekly-wrap check and **write the
  residual risk down** rather than presenting it as closed.

### E7 · Alerting must not become the failure

- `alertAdmin` already swallows its own errors and logs. Keep that.
- The digest is composed and sent **after** the note is sent, in its own try/catch.
- If `TELEGRAM_ADMIN_CHAT_ID` is unset, log and continue, as `alertAdmin` does today.

### E8 · Scope

The daily note pipeline first. Ship the registry, the digest, and the three connectors that
already carry validity signals — breadth, the option chain, and FRED's `answered` flag —
then instrument each remaining connector as it is touched. Do **not** gate Part D on
instrumenting all eight. `run-weekly-wrap.ts` reuses the helper afterwards.

Not a general framework: a registry, a record type, a formatter, and one table.

---

## Build order

**Shipped 2026-08-13** — C1 (FOMC dates, sort, cap), A1 + A3 + A4 (sign, 45-day horizon,
volatility guard, in one release), A2 + A7 + A9 (wording, legacy correction, caveat),
A5 (zero-gamma), A6 (overnight delta), A8 (route deleted). Plus one guard the plan did not
foresee: a minimum-coverage floor on the option chain, after Yahoo was measured returning
zero open interest across the whole chain at 00:54 ET.

Remaining:

| # | Item | Note |
|---|---|---|
| 1 | **E2-E5, E7 — health core** | FIRST. Registry, record, digest, table, edge-triggering, static-horizon check. Instrument only breadth, chain and FRED — the three that already carry validity signals. |
| 2 | **Per-connector timeouts** | A precondition for `down` being detectable, and for D1 not being able to stall the note. Nothing in `assemble.ts` has one today. Use the `withTimeout` race that already exists at `write.ts:283`, applied at the assemble call sites — do NOT plumb `AbortController` through yahoo-finance2. The abandoned promise lingers; the run proceeds and the digest composes, which is the actual requirement. D1's raw `fetch` gets a real `AbortController`. |
| 3 | D1 / D2 / D2a Nasdaq connector, unique-match join, offset invariant, name transcription | The join is exact per M13-M15; the offset invariant is the part that can rot |
| **4-6** | **ONE PR: D6 string retirement + D3 surprise rendering + D7 validator** | Explicitly one release. A "same release" constraint spread across three line items is how it slips, and shipping 5 without 4 makes the note refute itself. |
| 7 | B1 / B2 / B4 series-context helper | Now the FALLBACK line, and what survives a D outage |
| 8 | B5 / D5 registration and ladder rungs | Ships with 5 and 7 |
| 9 | C2 forward consensus, threshold as fallback | Needs 3 and 7 |
| 10 | D4 collection only — table + nightly append + forward intraday capture | No backfill, no rendering |
| 11 | E6 external dead-man's ping | One `fetch`, and the only guard that survives the repository going dark |

## Decision value to a reader

1. **D3 surprise** — "+0.1% against +0.3% expected" is the single most informative sentence
   the release block can carry, and it has never been able to say it
2. **E connector health** — zero reader value, and it is second, because everything above it
   is worthless the week it breaks and nobody notices
3. **C2 forward consensus** — turns the calendar from a list of times into a list of stakes
4. **B1** — IC4WSA, payrolls 3-month average, CPI and PCE 3m/6m annualized

## Cut outright

- **D4's rendering and its backfill.** Noise at this N, over-read by construction, and the
  backfill join is the one step M13 does not validate. Collection continues so the question
  can be answered properly in two years.
- **B3 rank and range.** Already marginal; last of eight behind larger work never gets
  built, and carrying it is planning overhead. Reinstate if a reader asks.
- **Static per-release briefs**, and **LLM scenario prose** — both cut in the earlier round
  and not revived by M9.

## Open for you

- **D8.** Depending on an undocumented Nasdaq endpoint — accepted, with §1a on the page,
  Part E on the operator, and timeouts so it cannot stall the run.
- **E6.** The external dead-man's ping needs a healthchecks.io-style account and one URL as
  a secret. If you would rather not add an external dependency, say so and the plan falls
  back to the weekly-wrap check with the shared-failure-domain risk recorded rather than
  closed.
- **Spec.** `docs/daily-note-v2-spec.md` §I (line 736) needs reversing, with M9-M15 recorded
  as the evidence.

## Review trail

Four rounds. What the reviewer changed, in the order it mattered:

1. The gamma sign convention should not ship as an enum that dresses a bug as a school of
   thought — hence a renamed field and a correction on archived notes.
2. The zero-gamma bisection must bracket each side of spot separately, or a two-sided book
   reports no crossing at all.
3. The reaction study should not be rendered: noise at N≈10, and over-read by construction.
   Collection only.
4. Ten shipped assertions that "no consensus feed exists", four of them persisted, would
   have made the first consensus note refute itself.
5. Edge-triggered alerting flaps on exactly the failure shape Yahoo already exhibits, so
   `degraded` waits for a second session.
6. The weekly-wrap watchdog shares a failure domain with the thing it watches.

What measurement changed, against the reviewer:

1. The invented 30% volatility fallback was called a blocker; measured dormant, and the pin
   and zero-gamma level are invariant to it.
2. The zero-gamma level was called false precision; measured stable across every band,
   filter and horizon — including the horizon that moves net gamma by 55%.
3. The `previous` join was called a blocker on the theory that Nasdaq carries the first
   print; measured, it carries the current vintage, and the join is exact on six series.
