# Daily Note v2 — Depth Roadmap (slices 5–9)

**Status:** Largely shipped — see the ledger below · **Companion to:** `docs/daily-note-spec.md` (v1, slices 1–4, shipped)
**Last updated:** 2026-08-10

---

## Implementation ledger

| § | State | Notes |
|---|---|---|
| **H0.1** validator registration | ✅ shipped | `validate.ts`. EPS and price targets deliberately withheld from the pool |
| **H0.2** degradation ladder | ✅ shipped | `render.ts`. Interleaved, and now **monotonic** — asserted by test, having been broken twice |
| **G** after-hours | ✅ shipped | Gate + "as of" clock; refreshes on re-run |
| **A** relevance, stage A | ✅ shipped | Both entry routes, capped union. Coefficients still a hypothesis — logged per run, unreviewed |
| **A** relevance, stage B (ATR re-rank) | ❌ not built | Deliberately sequenced behind a few weeks of stage-A logs |
| **A** `sector_weight` | ✅ shipped | Plus `first_seen` (migration 0027) as a membership ratchet |
| **B** attribution rungs 1–3 | ✅ shipped | Earnings, rating, target-only. Two-verb rule, two-source beat/miss |
| **B** rung 4 (8-K / EDGAR) | ❌ not built | Free and worth building; catches the M&A and CEO-exit days |
| **B** rungs 5–6 (halts, headlines) | 🚫 cut | Halts are rare enough to be maintenance without payoff; "a headline existed" is correlation dressed as cause, and the bare mover line is more honest and free |
| **B** MOVERS section | ✅ shipped | Including rung 7: a ranked name with no reason prints bare |
| **1b** prose ban | ✅ shipped | Default-deny, field-scoped, **and alias-aware** — company names are policed like tickers |
| **1b** sector↔partner phrase table | ⏸ deferred | Copper (`HG=F`) is now a registered cross-asset, so the numerals exist. The table itself waits on sector nouns joining the alias list — without that the validator cannot require it, and an unenforced table is a suggestion |
| **C** weekly wrap | ✅ shipped | Including THE WEEK REVIEWED: divergence follow-through (measured against the sector, both legs or neither), pin distance, the week's biggest surfaced moves, concentration over reconciled sessions, VIX band crossing, and the earliest hook quoted without a verdict. Unvalidated against real data until ~2 weeks of notes exist |
| **C** single-name weeklies | ❌ not built | Needs stage B's bars — one PR with the ATR re-rank |
| **D** timeframes, benchmarks | ✅ shipped | Scaled split-defect tolerance; labelled in sessions |
| **D** timeframes, single names | ❌ not built | Needs stage B's bars; one PR with the ATR re-rank |
| **E** macro releases | ✅ shipped | Actual vs prior, basis stated, staleness-gated, revision-flagged |
| **E** FOMC static list | ⏸ empty on purpose | The mechanism ships; the dates must be pasted from federalreserve.gov. Guessing them is the fabrication §1a exists to prevent |
| **F** expectation memory | 🚫 **removed** | Built and correct, and it graded **zero** bets: nothing ever inserted a row, and structurally nothing could. See §F below |
| **I** economic consensus | 🚫 closed | No free source. Reported vs prior, and said so. FMP client deleted |

**Retired:** `FMP_API_KEY` and `sources/econ-calendar.ts`. The paid calendar was never configured, so the
TELLS section it fed rendered as nothing every night; FRED's release calendar replaces it on the existing key.

v1 ships a factual note that never lies. Its weakness, measured against the reference
publication, is **depth**: we name ~10 stocks with a percentage and no reason; we carry no
macro, no earnings, no memory of yesterday. This document specifies the depth work.

Every v1 rule still binds — above all **§1a: never fabricate; omit instead**, and **§8:
numbers never originate from the LLM**. v2 adds a second rule of the same kind:

> **§1b — Causes never originate from the LLM either.** A reason clause is retrieved,
> dated, and direction-checked, or it is not printed — and it is printed **by the renderer**.
> The model never carries a reason for an individual instrument at all.

**§1b is enforced by default-deny, not by a keyword list.** An earlier draft checked prose
against a lexicon of event nouns (`downgrade|beat|guided|…`). That is default-allow and it
leaks badly, because English carries cause through connectives, not nouns: "NVDA slid **as**
Washington floated export curbs", "fell **following** results", "**tracking** crude lower",
"**in sympathy with**" — every one of those invents a mechanism while containing no listed
token. Pronoun subjects ("it fell after the print") and company names instead of tickers
escape too, and in a multi-ticker sentence a second name free-rides on the first one's fact.

A first attempt kept an "unless the reason phrase appears verbatim and adjacent" escape hatch.
Testing killed it: it left the rest of the sentence exempt (so a second, invented mechanism
could ride along), "adjacent" was undefined, and — decisively — it collided with v1's own
prompt, which **mandates** a because/despite in every What-Matters bullet. Banning connectives
outright while requiring them one file away would have emptied the section.

**The resolution is to separate the two jobs, so neither rule fights the other:**

> **Attribution is rendered deterministically, never by the model.** The pre-composed reason
> phrase — which *contains* its own ticker, e.g. "AKAM fell after reporting Q2 EPS $1.59 vs
> $1.58 est" — is emitted by the renderer on the mover line.
>
> **LLM prose may not name a ticker in the same sentence as a causal connective. No
> exception.** There is no escape clause to scope, no adjacency to define, and nothing for the
> model to paraphrase.
>
> **Sector and cross-asset relationships stay sayable** through a small, enumerated set of
> *deterministic, sign-checked* phrases the assembler supplies as facts. The model may use
> these; it may not invent others.

That set must be a real table, not an example, and its wording must be **correlative rather
than causal** — co-movement is not causation. XLE and crude can rise together on a day whose
actual driver was a single acquisition, so "as crude firmed" would mint a false cause while
passing both sign checks. Write "with crude +1.2%" instead, and require a magnitude floor on
both legs (a 0.1% sector against a 0.05% commodity is noise, not a relationship):

| Sector | Partner | Emitted when | Phrase |
|---|---|---|---|
| XLE | crude `CL=F` | same sign, both \|move\| ≥ 0.75% | `with crude ±x.x%` |
| XLB | copper `HG=F` | same sign, both \|move\| ≥ 0.75% | `with copper ±x.x%` |
| XLF | 10Y yield | same sign, sector ≥ 0.75% **and** yield ≥ 4bp | `with the 10Y ±Nbp` |
| XLU, XLRE | 10Y yield | opposite sign, sector ≥ 0.75% **and** yield ≥ 4bp | `against the 10Y ±Nbp` |
| XLK, XLC | — | — | none; no defensible single partner |

Both legs are floored in every row — the yield rows previously floored only the yield, which
would have emitted on a 0.05% sector move. XLB names **copper specifically** rather than a
vague "metals", so the tested leg is unambiguous.

**Register the partner numerals.** Crude and the 10Y are already pooled through the existing
cross-asset and rates facts, but **copper is not in the pool at all** — so a legitimate XLB
phrase would be silently dropped at validation, leaving one of five rows half-dead. Add
`HG=F` to the cross-asset facts (§H0.1's register list) whenever the XLB row is enabled.

**Enforcement is honest about its limit.** A ticker-free sentence naming a sector is not
caught by the §1b containment test, so sector narration — like macro narration — is on the
honour system unless sector nouns are added to the alias list. Adding them is the stricter
option and makes the table above the *only* way to say anything relational about a sector.

This preserves v1's because/despite mandate, because a bullet may still relate two facts we
both printed ("breadth was negative **despite** the index rising" names no ticker and asserts
no external mechanism). It also resolves a clash with the shipped claim ledger: since only the
deterministic line carries the phrase, a bullet can never repeat those numerals and get itself
auto-cut.

**Alias mechanics:** the alias list is built from `sp500_constituents.name`, which is
**nullable** and holds legal names — normalise (strip Inc./Corp/Class A), fall back to ticker
only when null, and match case-sensitively on word boundaries so ordinary words that are also
company names (Target, Gap, Visa, Apple) do not produce false hits.

**Disclosed residual:** a macro sentence naming no ticker and no sector ("the cut just got
repriced out") is still model-authored and unpoliced. Connective lists are finite and English
is not, so this **reduces** model-authored causes about instruments to near zero and leaves
macro narration on the honour system. Say that plainly rather than claiming elimination.

---

## Verified findings that shape this plan

Each was checked against the live API or the repo, not assumed.

| Finding | Consequence |
|---|---|
| **The note persists no prose.** `daily_notes` holds `facts`, `push_html`, `web_body` only; `run-daily-note.ts` renders prose then discards it | Nothing can quote what we said. Blocks §F |
| **The note makes no predictions.** `write.ts` forbids the LLM from inventing watch-levels; nothing else adds any | There is nothing to grade. Blocks §F |
| **FRED's release calendar is free and works** with the existing key. IDs: CPI 10, PPI 46, Employment Situation 50, GDP 53, PCE 54, FOMC 101, Jobless Claims 180, JOLTS 192, Retail Sales 9 | §E is buildable with no new key |
| FRED gives release **dates and actuals and priors — but no consensus** | §E reports surprise **vs prior**, not vs consensus, until a paid feed exists |
| **`hasPrePostMarketData` is `false` for `^GSPC`**, `true` for single names | After-hours applies to names/ETFs only, never indices |
| `postMarketPrice/ChangePercent/Time` ride the **quote calls the pipeline already makes** | §G costs zero extra requests |
| **AKAM, 7 Aug:** reported 6 Aug post-close, EPS **$1.59 vs $1.58 est — a beat** — and fell **‑6.8%**. The five same-day analyst actions were all `action:"main"` with **mixed** target moves (RBC 150→135, Piper 156→140, but UBS 125→143, Guggenheim 181→190) | The honest clause is "**after** reporting", not "**on** a downgrade". Proves §B's two-verb rule is necessary, not decorative |
| `stock_prices_daily` stores **raw close only**; `ticker_metrics` covers a different universe | Neither is usable for multi-timeframe. Fetch fresh adjusted bars |
| `labeling.ts` is the repo's split-invariance authority (returns computed inside the adjusted series; defects found by raw-vs-adjusted disagreement, not magnitude) | §D reuses its method rather than inventing one |
| `events/earnings.ts` **cannot answer "who reported today"** (per-ticker only, stub timing, private 350 ms limiter banned from this job) | §A needs a different discovery path |
| The seed **discards the sector ETF's own `Weight` column** and **destroys membership history** (upsert + prune, `updated_at` rewritten every run) | Two small columns needed: `sector_weight`, `first_seen` |
| `daily_notes.date` only exists for sessions that passed the §7a gate | It is the de-facto trading calendar **for §C's week anchors only**. §F must not use it — horizons have to survive an outage in which no rows exist |

---

## §A — Which stocks actually matter (relevance)

Today a name surfaces only by `|move − sectorMove|` or by SPY weight. So a small utility
bucking its sector outranks a mega-cap on a real move. Replace with a two-stage score.

**Stage A — all 503 names, zero extra requests.** Every input below is already in the batch
quote payload the pipeline pays for, or in `sp500_constituents`; the work is type-widening.

```
dollarVol   = regularMarketVolume × price                    (widen QuoteResult)
rvolQ       = regularMarketVolume / averageDailyVolume10Day   (widen)
gap         = |changePct − sectorEtfPct|                      (exists)
sectorShare = spyWeight / Σ spyWeight in same sector          (exists)
reported    = "today is the reaction day" per §B's session-half table (NOT an interval test)

relevance = gap
          × sqrt(pctl(dollarVol))                            // damp illiquid, never zero
          × bellwether                                        // see below
          × (reported ? 1.75 : min(1 + max(rvolQ − 1, 0)/3, 1.75))   // a reason to care today
```

Multiplicative on purpose: a name must be **anomalous AND tradeable AND have a reason** to
rank. **Treat the coefficients as a hypothesis, not a specification** — log every component
per run and review against a few weeks of real output before calling them settled.

Three definitions the first draft left dangerously loose:

- **`pctl(dollarVol)` is a per-run cross-sectional rank**, `rank / (N + 1)`, so it is never
  exactly 0 and the "damp, never zero" comment is actually true. Without the `+1` the least
  liquid name is annihilated by `sqrt(0)`.
- **`bellwether` must be normalised *within* sector before it is compared *across* sectors.**
  The draft's `0.5 + min(sectorShare / leaderShare, 1) / 2` is incoherent cross-sector: in a
  top-heavy sector the leaders hold most of the weight, so nearly every other name collapses
  to ~0.5, while in a flat sector mid-caps sit at 0.7–0.9. Since the top-10 cut ranks names
  from all sectors together, that hands flat sectors a systematic 1.5–1.8× advantage — it
  **re-creates the exact "a small utility outranks a mega-cap" failure this section exists to
  fix**. Use the name's within-sector weight percentile instead, mapped to `[0.5, 1.0]`, so
  the factor means the same thing in every sector.
- **`leaderShare`** is then unnecessary and is removed.

**A second entry route is required — and it must not depend on data it cannot have.** Because
the score leads with `gap`, a mega-cap whose move *is* the sector move scores near zero — NVDA
at ‑5% dragging XLK to ‑2.5% has a gap of 2.5, while a mid-cap at ‑5% in a flat sector has a
gap of 5. Divergence-first is a defensible editorial stance, but it is not the same thing as
"which stocks actually matter".

The first draft admitted route-2 names by `|move| / ATR14%` — which is circular, because ATR
needs daily bars and bars are fetched only for the top-10 *by relevance*. The name the route
exists to rescue is never in that set, so the route could never fire. Route 2 must therefore
pre-select **bar-free**: top-N by `|changePct|` above a dollar-volume floor. Bars are then
fetched for the **union** of both routes, and the union is capped (~15 `chart()` calls) so
top-K stays bounded and the budget is fixed. A name qualifying by both routes is fetched once.

**Degenerate cases:** `gap ≈ 0` correctly scores ~0; a missing `averageDailyVolume10Day`
leaves the RVOL term at neutral 1.0 and is never imputed; a huge-volume, trivial-move name is
correctly suppressed by the leading `gap`.

**Stage B — the capped union, ~15 names.** It re-ranks the union of both entry routes (top-10
by relevance, plus route 2's top-5 by `|changePct|` above a $200M dollar-volume floor; both
figures are starting values to be tuned from logs). ATR-normalisation needs daily bars, banned for 503
names but trivial for the ~15-name union. Re-rank by `|move| / ATR14%` so a routine ‑2% in a volatile
mega-cap loses to a ‑4% that is 3.5 ATRs for its own name. The same union of `chart()` calls also
serve §D. Reuse `calculateATR` from `scanner/indicators.ts`.

**"Leaders of each category", without curation drift:** the leader set is **top-3 by
`spy_weight` within each `sector_etf`**. It self-refreshes with the quarterly reseed and
inherits the existing 45-day-warn / 120-day-reject staleness gate. Explicitly rejected:
`scanner_universe` (hand-curated, multi-market — the exact drift to avoid) and the theme
tables (usable later as an optional overlay, never as the definition).

**Known gap — sector weight ≠ SPY weight.** Sector SPDRs cap mega-caps for diversification,
so a sector contribution derived from SPY shares will fail reconciliation in top-heavy
sectors. The sector holdings files carry their own `Weight`, which the seed currently throws
away. Add `sector_weight` and give sector-contribution its own reconciliation gate mirroring
§8's.

**Earnings discovery and consensus — both free; FMP is not needed here.** A live probe settles
what an earlier draft treated as paywalled:

- **Who reported:** `earningsTimestamp` on the batch quote we already make. No extra calls.
- **Actual vs consensus, backward:** `earningsHistory` carries `epsActual`, `epsEstimate` and
  `surprisePercent` for the completed quarter (AKAM 1.59 vs 1.57684, +0.83%; AAPL 2.02 vs
  1.89243, +6.7%). That estimate **is** the street consensus.
- **Consensus, forward:** `earningsTrend` period `0q` gives the current quarter's average EPS
  estimate, the analyst count, and a revenue estimate.

**Finnhub's earnings calendar is free and settles discovery and timing** (its *economic*
calendar is not — see §E). One call returns the whole day: `symbol`, `date`, an explicit
`hour` of `bmo` / `amc` / `""`, `epsEstimate`, `epsActual`, and revenue on both sides (601 rows
across two days, 459 with actuals filled). The explicit `hour` is **authoritative timing** and
is strictly better than Yahoo's placeholder stamp — use it as the primary signal for §B's
session-half table, with the Yahoo stamp as a fallback when `hour` is `""`.

> **The two consensus sources disagree, and the disagreement flips the verdict.** For AKAM's
> Q2, Yahoo's estimate is **1.57684** and Finnhub's is **1.6052**, against the same actual of
> **1.59**. By Yahoo it is a beat of 0.83%; by Finnhub it is a miss of 0.95%. Both are
> reputable. Neither is wrong — they poll different analyst sets and cut off at different
> times.
>
> **Therefore: never print "beat" or "miss" unless both sources agree on the sign of the
> surprise.** When they disagree, the clause states the actual and stops — "after reporting Q2
> EPS $1.59" — which is exactly what the direction-neutral "after" verb was already designed
> to carry. When only one source is available, report the actual without a verdict.

This is the §1a rule applied to a soft number: a consensus figure is an estimate of an
estimate, and where two feeds contradict each other we do not get to pick the flattering one.
It also strengthens the case for "after" over "on" — the earlier draft claimed AKAM was a beat
that sold off, and that claim was itself source-dependent.

The one remaining gap is the **same evening**: a 4:15pm report has an estimate but no actual
by 6:15pm, so §B row 3 prints the after-hours move with no verdict — already the specified
fallback.

**§1a gate — the beat/miss trap.** "Reacted to earnings" is not "beat expectations". Emit an
`earningsReaction` fact carrying `{actual, estimate}` **only when both are present**;
otherwise the fact carries `reportedToday: true` alone, and the prose may say "after
reporting" but can never say "after beating". The numeral validator cannot police the *word*
"beat" — the gate must be structural, i.e. the field is absent.

---

## §B — Why a stock moved (causal attribution)

**Architecture constraint that decides the design:** the note runs in GitHub Actions with no
agent, and DeepSeek has no web search in this integration. So attribution must be
**retrieved, then attributed** — never recalled or inferred. Sources, all verified free and
already available: Yahoo `quoteSummary` (`upgradeDowngradeHistory`, `calendarEvents`,
`earningsHistory`), Yahoo `search()` for news with `providerPublishTime` and
`relatedTickers`, and SEC EDGAR. The existing `api/stocks/news/route.ts` is **not** reusable
(not exported, discards `pubDate`, Next-specific caching, bypasses the rate limiter).

**Ladder — evaluate top-down, first pass wins, lower rungs become corroboration:**

**Window arithmetic — do not use instant-in-interval tests.** Yahoo's `earningsTimestamp` is a
**date-level placeholder stamped exactly 16:00 ET**, not the real release time (verified: AKAM
reported ~4:15pm and is stamped `2026-08-06T20:00:00Z`; a Saturday-morning reporter carries
the same 16:00-ET stamp). An interval test on that field fails in both directions — it would
have given the showcase AKAM day *no* attribution, and it would have blamed the report for the
regular session that closed *before* it. Use date + session-half logic instead:

The stamp is in fact a **session-half placeholder**: before-open reporters are stamped 08:30
ET and after-close reporters 16:00 ET (verified across WMT, PG, KO, MCD, UNH at 08:30 and
AAPL, AKAM, AMD at 16:00). An earlier two-row table keyed every row on "at/after close" and so
matched **neither** case for a before-open reporter — rung 1 would never have fired for
roughly half of all companies, and the same-morning analyst actions would then have won,
printing "on a downgrade" for an earnings-driven move. That is the precise dishonesty this
section exists to prevent, so the table needs three rows plus an explicit no-match:

| Stamp | Meaning | Attribution |
|---|---|---|
| today, at/before 09:30 ET | reported before today's open | **Today is the reaction day** — rung 1 fires |
| prior session, at/after that close | reported after yesterday's close | **Today is the reaction day** — rung 1 fires |
| today, at/after today's close | reported after today's close, before the note | Regular-session attribution **forbidden**; hand to §G: "‑3.1% after-hours after reporting" |
| anything else (incl. weekend stamps, future dates) | unclassifiable | **No attribution** |

Corroborate that a report actually happened via `earningsHistory`'s most recent completed
quarter rather than trusting the stamp alone. Two traps:

- **The stamp rolls forward.** As a company approaches its next report the field holds a
  **future** date with `isEarningsDateEstimate: false` (verified: WMT stamped for a date two
  weeks ahead, flagged as not an estimate). So `false` does not mean "this is the last
  report", and the no-match row must catch future dates.
- **Corroboration may be impossible at 6:15pm.** A 4:15pm report will often not be in
  `earningsHistory` the same evening. Per §1a the fallback is to print the after-hours move
  **without** the reason clause — never to assert a report we cannot confirm.

1. **Earnings on the reaction day** — `epsActual` present for the completed quarter and the
   stamp resolves to "today is the reaction day" per the table above. Yields hard numerals.
2. **Rating change today** — `action ∈ {up, down, init}`. **Direction must match the move.**
3. **Target-only action today** — `action:"main"` with a target change. Weak; folds into
   rung 1 when earnings fired.

**Rungs 2–5 need their own window**, and it is not "today" loosely defined: the note runs at
6:15pm, and analyst actions land after it (verified: a UBS action on AKAM timestamped 7:31pm
ET). Use `(prior note cutoff, today 16:00 ET]` so a post-close action belongs to *tomorrow's*
reaction day and is never double-counted across two notes.
4. **8-K today** with a causal item code (2.02, 5.02, 1.01/1.02, 3.01, 2.01). Items 7.01/8.01
   are too generic — excluded.
5. **Trading halt today.**
6. **Same-day headline** — **web note only, never a causal claim in the push.** We assert
   only that the headline existed.
7. **Nothing passes → print no reason.** "AKAM ‑6.8%" bare is the correct output.

**The gate:** attribute only if an event exists in the window **AND** direction is consistent
**AND** the move clears **both** `|move| ≥ 1.5%` **and** `|move| ≥ 2× |ex-subject sector
move|`. Two corrections are baked into that sentence:

- The original "≥2.5% **or** 2× sector" attached a causal clause to a +0.3% name in a +0.1%
  sector — an attribution on noise. Both legs must hold.
- The relative leg must measure the sector **excluding the subject**, or a mega-cap
  self-contaminates the benchmark it is compared against: NVDA at ‑5% is itself much of XLK's
  ‑2.5%, so the naive test would demand ≥5% and earnings attribution would fail for exactly
  the largest reporters.

```
exSubjectPct = (etfPct − w × r) / (1 − w)     w = subject's sector_weight, r = its move
```

**Units:** weights are stored as **percent** in this repo (`spy_weight` is e.g. 7.99656), and
the formula needs a **fraction** — divide by 100 first. Using 24 where 0.24 belongs makes the
result catastrophically wrong rather than merely inaccurate. No `w → 1` guard is needed: the
SPDRs cap a single name near 24%, so `1 − w` stays around 0.76 or higher.

`w` **must** be `sector_weight` — the sector ETF's own weight, added by §A. SPY-derived share
is the wrong number here by §A's own finding: the SPDRs cap mega-caps, and mega-caps are
precisely the names this correction exists to rescue. The column inherits §A's staleness gate.

**Chosen fallback, not a fork:** when `sector_weight` is null or stale, **waive the relative
leg if rung 1 fired with earnings corroboration**, and otherwise omit the attribution
entirely. Earnings on the reaction day is strong enough evidence to stand on the absolute
floor alone; a rating action is not.

Otherwise omit.

**Two verbs, chosen deterministically — this is the core honesty device:**

- **"on"** (causal) is allowed **only** for signed events whose sign matches the move:
  a downgrade with a fall, an upgrade with a rise.
- **"after"** (temporal, direction-neutral) is used for earnings and 8-Ks, because stocks
  fall on beats. The AKAM case is exactly this: a one-cent beat, a ‑6.8% day, and mixed
  analyst targets. "After reporting Q2 EPS $1.59 vs $1.58 est" is true; "on a downgrade"
  would have been false.

A direction mismatch **drops** the attribution; it never flips it. One cause per ticker.

**Validating a non-numeric claim.** Per §1b the model never carries a reason at all, so there
are two separate obligations and they must not be confused:

**On the renderer** — the assembler composes the phrase, so the correctness checks apply to
*its* construction, not to prose:

1. **Direction table** — `downgrade → action:"down"`, `beat → epsActual ≥ epsEstimate`,
   `cut target → currentTarget < priorTarget`. A contradiction drops the attribution.
2. **Firm names** come only from `upgradeDowngradeHistory.firm`, so they are correct by source.
3. Every phrase **contains its own ticker**, which is what makes the prose rule below a simple
   containment test.

**On the prose** — default-deny, no fact lookup, no escape clause:

> A prose **field** that names or aliases any ticker may not contain a causal connective
> anywhere in that field. Fail outright; regenerate once; then drop.

**"Field" means one validated unit**: the hook, the curve read, **each individual
`whatMatters` element**, bull, bear, and book — matching how v1 already validates and drops
them one at a time. Treating the bullet array as a single field would ban "because" from every
bullet as soon as one named a ticker.

**The connective list is enumerated, not illustrative** — the ban is the enforceable artifact
of §1b, so it cannot be a set of examples:

```
on · after · as · amid · following · because · due to · owing to · thanks to
driven by · led by · fuelled by · sparked by · triggered by · prompted by
boosted by · pressured by · weighed by · helped by · hurt by
tracking · in sympathy with · in response to · on the back of · after news
so · thus · hence · therefore
```

`despite` is deliberately **excluded** — it is contrastive, asserts no mechanism, and v1's
bullet mandate leans on it.

The inferential group (`so`, `thus`, …) *is* included, on reflection. It looks harmless
because "AKAM fell, so the sector lagged" gives the ticker no cause — but a two-ticker field
("AKAM plunged, so its peers sold off") invents a sympathy mechanism *for the peers* and would
pass. The original reason for excluding it — protecting v1's because-mandate — evaporated once
bullets became ticker-free, so the exclusion now costs nothing and buys a leak.

The ban is scoped to the **field, not the sentence**. Sentence scope re-opens the pronoun leak
it was meant to close — "AKAM closed ‑6.8%. It fell after a downgrade." puts the ticker in one
sentence and the invented cause in the next, and both pass a per-sentence test. Since bullets
are a two-sentence "Claim. Evidence." form, sentence scope would make that split the *natural*
way to satisfy v1's because-mandate. Field scope closes it.

This leaves the model plenty: bullets may reason causally about macro, breadth, the index and
sector relationships — none of which name a ticker — which is how v1's mandate is satisfied
without inventing mechanisms about individual companies.

**v1 must be amended, not merely reinterpreted.** v1 §1 requires a divergence tell among the
bullets, v1 §5 routes the sharpest divergence *into* a bullet, and v1's sample bullets name
tickers — all of which now collide with the ban and would burn the single regeneration before
thinning WHAT MATTERS. The resolution, to be written into v1 §1/§4/§5 and the §8.2 prompt:

> **Bullets do not name individual tickers. The DIVERGENCE and MOVERS lines own the names**,
> and they render immediately above. A bullet refers to those names collectively ("three of
> the four biggest reporters fell on beats") or by sector, and keeps its because/despite.

Amendment targets, precisely: v1 **§1** (the divergence-tell requirement), **§4** (the section
order — which must gain **both** MOVERS *and* DIVERGENCE, since DIVERGENCE ships in the
renderer but was never written into §4's list), **§5** (which routes the sharpest divergence
into a bullet), **§9** (whose sample bullets name ICE and CME and would violate the amended
rule), and the **§8.2 prompt**.

That is also the better note: the names and their percentages already print, so a bullet that
repeats them is the redundancy v1's claim ledger exists to cut.

**Budget:** 2 Yahoo calls per named ticker (~10 tickers) + ≤11 EDGAR + 1 halts feed ≈ **32
requests, 15–30 s, $0**, inside a 12-minute job whose current worst case is ~4 minutes.
Combined with §A Stage B, §D and §E the total added latency is 1–2 minutes, which still fits.

**Where the attributed line renders — v1 §4's section order must be amended.** The fix above
depends on a deterministic line carrying the phrase, but v1's push names tickers only inside
DIVERGENCE and SPOTLIGHT, and no movers section exists. Without a home, the mechanism has
nowhere to live and the claim-ledger guarantee ("prose can never repeat those numerals and get
itself cut") does not hold either, because that guarantee requires the line to render *before*
prose.

Add a **MOVERS** section to §4's fixed order, immediately **after DIVERGENCE and before WHAT
MATTERS** — so it sits with the other deterministic single-name content and precedes all
prose. Cap it at 3 lines in the push; the rest go to the web note. Each line is
`TICKER ±x.x% — <reason phrase>`, or a bare `TICKER ±x.x%` when no rung passed.

**Ladder rung (completing §H0.2):** attribution clauses are an overflow driver, so the ladder
needs a rung that **drops the reason clauses and keeps the bare `TICKER ±x.x%`**, positioned
immediately after "macro detail" and before THE BOOK. Dropping a clause here is safe precisely
because these are renderer-built lines, not model grammar.

**Source discipline:** EDGAR requires a declared User-Agent and caps at 10 requests/second —
both mandatory, not optional. The halts feed is Nasdaq Trader's RSS. Every new per-ticker
`quoteSummary` call goes through `acquireYahooSlot`, the v1 rule that is easy to violate in a
new module — and the private 350 ms limiter inside `events/earnings.ts` remains banned here.

---

## §C — Weekly wrap ("The Week"), Fridays after the close

A separate workflow and a separate artifact (`weekly_notes`, keyed by `week_end`), posted
after the daily has persisted. Built **from the five stored `daily_notes` rows** plus a few
fresh fetches — nothing is re-derived.

**Anchoring without a market calendar** — `daily_notes.date` is the session calendar:

```
window       = ET Monday..Sunday containing the run
end anchor   = MAX(daily_notes.date) inside the window
start anchor = MAX(daily_notes.date) strictly before the window
weekly %     = end.close / start.close − 1     (both from stored facts)
```

This is holiday-proof by construction. A Good-Friday week ends Thursday; a Monday holiday
shifts the start anchor automatically. It is **not** outage-proof, however, and the query
cannot tell the two apart — so two guards are required:

- **No start anchor at all** (the first week after launch): skip and alert. Do not silently
  fall back to whatever history is reachable.
- **Start anchor older than the prior week** (a long outage): the span is no longer a week.
  Require the start anchor to fall within 7 calendar days of the window's Monday; otherwise
  either skip, or print the true span and label it ("since Jul 28"). Never label a fortnight
  as a week.

**Contents:** weekly index performance; sector board **and rotation** (did leadership flip
mid-week — computed from the five stored sector arrays); breadth trend across the week
(cumulative net advances; WSJ-gated days only, with the session count stated); rates curve
shift and steepener/flattener verdict; cross-asset Friday-16:00 to Friday-16:00; volatility
regime change including percentile-band crossing; the week's biggest single-name moves;
concentration on the days the reconciliation gate passed; **divergence follow-through**; and
gamma-pin adherence.

**"What we said vs what happened" — three tiers, and the third is a refusal:**

- **Checkable now:** divergence follow-through (flagged name vs its sector ETF, sign match,
  always with the denominator); pin adherence (arithmetic on stored strikes).
- **Needs plumbing:** persist `prose` so a later wrap can *quote* Monday next to Friday's
  outcome — juxtaposition only, **no scoring verb**.
- **Needs a paid feed:** econ actual vs the *consensus* we stored at the time. `consensus` is
  null without an FMP key (§E), so this cannot be in the "checkable now" tier. Actual vs
  **prior** is available free and is the honest substitute until then.
- **Never:** grading the hook or the bull/bear box. It is balanced by design, so any score is
  a coin flip dressed as skill. Section title is **"THE WEEK REVIEWED"**, not "scorecard".

**Schedule:** own workflow, dual-cron for DST, ~30 minutes after the daily's late slot. Gate:
require ET Friday; resolve the end anchor; if Friday traded but Friday's note is missing,
**skip and alert** — never wrap a truncated week as if it were complete.

---

## §D — Multi-timeframe truth (1D / 1W / 1M)

**Definition:** 1W = 5 trading bars, 1M = 21 trading bars, computed as
`adjclose[last] / adjclose[last−N] − 1` from one `chart()` response, retaining both raw and
adjusted series. Label them **"5-session" / "21-session"**, so a holiday week never makes
"1 week" a lie.

**Universe:** always the ~20 benchmarks (indices, 11 sector ETFs, cross-asset, VIX); single
names only when they clear §A's relevance cut, reusing Stage B's bars. **Never all 503** — a
stored adjusted-price table is worse than useless because `adjclose` is retroactively
rewritten by every split and dividend.

**Traps and gates:**

1. **Never mix adjusted and raw legs.** Both legs come from the same array of the same
   response — enforced by a helper that accepts only a bar array.
2. **Split/defect** — reuse `labeling.ts`'s disagreement *method* but **not its constant**.
   Its 6% dividend tolerance is deliberately generous for multi-week labels; over 5 sessions
   dividends explain at most 1–2%, so a 4–5% raw-vs-adjusted defect would slip through and
   could flip the sign of a "5-session" figure. Scale the tolerance with the window: about 2%
   at 5 sessions, 4% at 21. Beyond it, omit that name's figure entirely.
3. **Dividends** — adjusted returns are total-ish; prefer the price index for the headline.
4. **Aggregated 1M claims over today's membership are banned** — the seed destroys membership
   history, so such a claim is survivorship-shaped. Per-name claims are fine. Add `first_seen`
   (preserved on conflict) if aggregates are ever wanted.
5. **Partial last bar** dropped unless the session gate confirmed the close.
6. **Cross-note references** resolve from stored `facts`, never by re-fetching history — the
   archived fact is what we actually said.

---

## §E — Economic releases: expectation vs reality

Today the note carries **no macro at all**, so it cannot repeat a stale figure — but that is a
gap, not a virtue.

**Build on FRED's release calendar** (free, verified), with four corrections a naive
implementation gets wrong:

1. **The whitelist is `(release_id, series_id, transform)` triples, not release IDs.**
   Release → series is one-to-many (CPI alone carries thousands), and each headline needs its
   own transform. Use FRED's `units` parameter so every transform is uniform and buildable
   (`pc1` for year-over-year, `pch` for month-over-month, `chg` for a first difference)
   rather than hand-rolled arithmetic. **Series choice matters:** the headline 12-month CPI
   figure is computed from the **not-seasonally-adjusted** `CPIAUCNS`, not `CPIAUCSL` — the
   two differ (3.53% vs 3.46% for one recent month), and across a rounding boundary our note
   would disagree with every published headline and look fabricated. Year-over-year uses
   `CPIAUCNS`; month-over-month uses `CPIAUCSL`. Payrolls is a first difference of `PAYEMS`.
2. **Drop FOMC (101) from the calendar entirely.** It carries daily series, so FRED dates it
   *every calendar day including weekends* — a whitelist would print "FOMC lands today" every
   single day. Use the Fed's own meeting calendar, which is published years ahead, as a static
   list, and frame FOMC as an **event** ("FOMC decision 2:00 ET"), never as actual-vs-prior:
   the target rate is unchanged at all but a handful of observations a year, and the content
   that matters (statement, projections) is not a FRED series at all.
3. **`include_release_dates_with_no_data=true` is load-bearing.** Without it the endpoint
   returns no future dates, which is exactly what a "what lands this week" query needs.
4. **FRED gives dates, not times.** Release times are a hardcoded per-release map (8:30 ET for
   CPI, PPI, employment, claims, retail sales, GDP and PCE; 10:00 ET for JOLTS).

On release day, pull the series observation and report the actual **against the prior**,
stating that basis explicitly.

**Revisions are a general problem, not a GDP one.** FRED's "prior" is the *revised-at-fetch*
value, not the figure published at the time — and the gap is often larger than the surprise
we would be reporting. One recent payrolls month was first published at 158,984k and stood at
158,881k five weeks later: a 103k revision, bigger than many headline prints. Quoting the
current vintage as "prior" therefore misstates the comparison. Two acceptable fixes, and the
second is better: label it "prior (revised)", or use FRED's `realtime_start`/`realtime_end`
parameters — free, same key, verified working — to quote the prior **as originally
published**. Retail sales and PCE revise the same way.

**GDP additionally needs an estimate label.** Advance, second and third estimates make the
same quarter print three times. Say which one it is, and never present a revision as a
surprise.

**The honest limit:** FRED has no consensus. So:

| Claim | Buildable now |
|---|---|
| "CPI lands Wednesday 8:30 ET" | Yes |
| "CPI printed 3.4%, prior 3.1%" | Yes |
| "CPI printed 3.4% vs 3.1% expected" | **No** — needs a paid calendar |

A surprise measured against the prior is real information. It must be **labelled as such** and
never worded as a consensus miss. Staleness gate: a release is only quoted on or after its
release date, and the observation date must be the expected period — never a figure from
weeks ago presented as news.

---

## §F — Expectation memory — REMOVED

**Shipped, then deleted 2026-08-10.** The schema, the resolver, the LEDGER renderer, the
degradation rung and all five structural anti-flattery locks were built and, as far as anyone
could tell by reading them, correct. They graded **zero** expectations.

Nothing ever inserted a row. There was no owner-facing way to register a bet and no `auto_*`
generator, so `note_expectations` was written to by exactly nothing across the whole life of the
slice — and `facts.ledger` was therefore null on every single note ever sent.

The design was sound and the omission was one function. The reason for deleting rather than
finishing it is that the owner does not want to register bets by hand, and the one origin the
spec categorically refuses is the only one that would fill the table automatically: a model that
writes the prose and mints the predictions will mint easy ones. With `owner` off the table and
`llm` forbidden, there is no source of expectations left.

An accountability ledger that is permanently empty is worse than no ledger. It occupies the place
where a record of our calls would go and implies there is nothing to report, when the truth is
that nothing was ever registered. §1a's "omit rather than assert" applies to the note's own track
record too.

**What went:** `note_expectations` (dropped by `drizzle/0029_drop_note_expectations.sql`;
migrations 0025 and 0026 stay as history), `src/lib/notes/expectations.ts`, `ledgerSection` and the
`showLedger` rung in `render.ts`, `LedgerEntry` and `StructuredFacts.ledger`, and the LEDGER entry
in v1 §4's section order.

**Worth salvaging if this is ever revisited, or if §C needs it:** `closesSince` — a small, correct
"daily closes for a symbol since a date, keyed by ET date" helper that backfills the sessions a
pipeline outage skipped. It is in git history at `src/lib/notes/expectations.ts`, and §C's
divergence follow-through needs exactly that shape.

**If a ledger is ever wanted again, the hard part is not the code.** It is having a source of
falsifiable, pre-registered claims that is neither hand-written nor model-invented. Solve that
first; the resolver is recoverable from history in an afternoon.

## §G — After-hours

Applies to **single names and ETFs only** — `hasPrePostMarketData` is `false` for indices.
Costs **zero extra requests**: the fields ride the quote calls already made.

**Gate — all four required:** the extended fields are present and finite; `postMarketTime` is
today-ET and **at or after that session's actual close**; `|postMarketChangePercent| ≥ 2.0%`;
and the ticker is **already named** in the note (after-hours annotates, it never introduces a
name).

Do not hardcode 16:00 in that second condition. On a 1pm half-day the post-market session runs
from the early close, so a 16:00 test would reject legitimate prints. Derive the boundary from
the session close, the same way §7a derives everything else.

**Units:** `postMarketChangePercent` is expressed in percent, not as a fraction (AKAM's
‑0.0363 is ‑0.04%, not ‑3.6%). Misreading it as a fraction would make the 2% gate pass
essentially everything — worth an explicit comment where the type is widened.

**Rendering** is deterministic, never LLM-authored, and always clocked so it cannot read as a
close: `AKAM ‑6.8% (‑3.1% after-hours as of 6:15pm ET)`. The clock comes from
`postMarketTime`, not from send time.

**On re-run: refresh, do not freeze.** The claim is "as of «time»", so re-rendering keeps it
true at edit time; freezing would strand a stale number inside an otherwise-updated note. The
gate re-applies, so a move that decayed below 2% is correctly removed.

**Known limitation:** there is no `postMarketVolume` field, so a thin name's after-hours print
may be a single odd lot. The 2% threshold and the "as of" wording are the only mitigation.

---

## §H0 — Two prerequisites that block almost everything

These are not features. Skipping them makes §B, §E and §G fail on contact with the shipped v1
pipeline, so they are step 1.

**H0.1 — Register the right new numerals, and deliberately withhold the rest.**
`collectAllowedNumbers` enumerates a *closed* list of fact fields, so any numeral outside it
fails validation and the bullet is dropped. Under §1b that cuts two different ways, and the
split is the design:

- **Register:** macro actual and prior (§E), after-hours percentages (§G), and the §D
  timeframe figures. Prose is allowed to discuss these, so they must be in the pool or
  legitimate bullets die.
- **Do NOT register:** EPS actual/estimate and price targets. Those numerals live only on the
  deterministic mover line. Leaving them out of the pool means any bullet that tries to cite
  them fails automatically — which is now exactly the behaviour we want, and it enforces §1b
  as a side effect rather than as a second mechanism.

This also disposes of a problem the earlier draft had no answer for: the pool is a flat,
unit-blind `number[]`, so nothing can classify a prose numeral as "an EPS", and the generic
0.05 tolerance would have let an EPS wrong by four cents pass. Withholding beats tolerating.

**H0.2 — Extend the degradation ladder to cover deterministic content.** v1's ladder strips
*prose* only (book → bull/bear → what-matters → prose-free), then trims spotlights, then
**throws**. Every v2 addition — attribution clauses, after-hours annotations, a macro line — is
deterministic, so on a heavy day the note can exceed 4,096 characters with prose already gone.
Today that means **no note at all**.

**Interleave the new rungs; do not append them.** Appending would strip the entire product
voice before dropping a single decorative suffix — inverted against v1's irreducible core, which
is the reasoning, not the ornament. Order:

```
after-hours annotations → macro detail (keep the headline, drop the context) → mover reason
clauses → THE BOOK → bull/bear → trim What-Matters bullets → prose-free → trim spotlights → throw
```

**The ladder must be monotonic, and this is not automatic.** Each rung is a set of flags, and an
omitted flag defaults back to ON — so a later rung silently re-adds content an earlier one
dropped, and degrading the note makes it bigger. This has been got wrong twice: once in the
What-Matters trim rungs, and once at the boundary where the prose ladder fell back to a
*full-ornament* deterministic note. `pushLadder` is exported for no reason other than to let a
test assert the property directly.

**Clause-dropping is restricted to deterministic renderer lines.** Stripping a phrase out of a
*validated* LLM bullet leaves broken grammar and can re-violate §1b by orphaning a connective.
Each new rung must also specify its residual form — a degraded macro line keeps "CPI 3.4%
(prior 3.1%)" and drops the surrounding read.

## §H — Build order

1. **§H0 first** (validator registration + degradation ladder), then the cheap wins with no
   new sources — §G after-hours (type widening); §A Stage A relevance (type widening) +
   `sector_weight`; §D benchmarks-only timeframes; persist `prose`.
2. **§E macro** — FRED release calendar whitelist + actual-vs-prior.
3. **§B attribution** — the ladder, the two-verb rule, and the default-deny prose ban. Highest
   value, most new surface.
4. **§C weekly wrap** — needs (1) and the stored prose; ships without single-name weeklies
   on its first run.
5. ~~**§F expectations**~~ — built, then removed. See §F.

---

## §I — Open questions

- **Economic consensus — resolved as "not available, and that is fine".** Finnhub's free tier
  returns `You don't have access to this resource` for the economic calendar, and FMP's free
  tier rejects it too. So the note reports macro **actual vs prior**, free and honest, and
  states that basis. Revisit only if someone wants to pay; nothing else is blocked by it.
  (Finnhub's *earnings* calendar **is** free and is now a primary source — see §A.)
- **Live-evening probe** — the extended-hours fields and `marketState:"POST"` behaviour at
  6:15pm ET were only observable on a weekend. Probe once on a real trading evening before
  shipping §G.
- **Relevance weights** — the §A coefficients are a first guess. They should be logged per
  run and reviewed against a few weeks of output before being treated as settled.
- **Attribution deepens the Yahoo dependency**, which is unofficial. Accepted repo-wide, but
  worth stating.
