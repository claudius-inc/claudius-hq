# Perp signal research — findings and how to extend them

The systematic pipeline for testing indicators and indicator combinations on
Binance perps, the findings it has produced so far, and the procedure for adding
the next experiment to the record.

This document is a **ledger**. Every combination tested goes in the results
table with its numbers and its date, whether it won or lost. Negative results are
the more valuable half — they are what stops the same idea being re-tried every
quarter — so nothing is deleted when it fails.

---

## 1. What is currently shipped

The daily *Convergence — Binance Perps* message ranks by a validated composite:

```
gate:  top 30% of qualifiers by  mean( rankZ(rvol), rankZ(|funding|) )
order: rankZ( rev6 ), signed by side, ranked within each side
```

| Leg | Bucket | What it is |
| --- | --- | --- |
| `rvol` | volume (validation) | Bar traded value ÷ its own 20-bar average |
| `fundingAbs` | attention (liquidity) | \|latest funding rate\| |
| `rev6` | momentum (speed) | Negated 1-day return — high means it just fell hardest |

The convergence score still **gates** the list at ≥ 5 of 7. It no longer orders
it. `|OI change|`, the previous ranking key, is now annotation only.

Implementation: `assignComboScores` and `rankPicks` in
`src/lib/markets/convergence-screen.ts`.

### What is claimed, and what is not

| Claim | Status |
| --- | --- |
| The composite orders the cross-section better than the alternatives | **Measured.** Holdout IC 0.078, t = 5.97, procedure-level bootstrap p = 0.005 |
| It beats the shipped convergence score | **Measured.** Same holdout rows: composite +0.078 vs `shippedScore` −0.027 |
| Following it makes money | **NOT SHOWN.** Top-10 basket excess t = 0.15; absolute −0.044% vs buy-everything −0.102%; dateWin 46.2% |
| It works on the tradfi book | **NOT SHOWN.** The panel is 99.6% crypto (see §5) |
| The gate width 0.30 is optimal | **Not tested, deliberately.** Fixed a priori; searching it would be an unaccounted dimension |
| Ranking works *within* the convergence-qualified subset | **Extrapolated.** Validated over the liquid universe, applied to the ≥5 subset |

The last row is the most important open question. The study says the convergence
gate carries a *negative* IC, so the natural next experiment is whether the gate
should exist at all — see §6.

---

## 2. The pipeline

```
scripts/research/fetch-perp-positioning.ts    funding / OI / taker series  -> tmp/
scripts/research/run-perp-signal-study.ts     one signal at a time
scripts/research/run-perp-combo-search.ts     combinations + parsimony frontier
```

| Module | Role |
| --- | --- |
| `src/lib/markets/perp-signals.ts` | The registry. One entry per indicator. |
| `src/lib/markets/perp-panel.ts` | Grid, execution lag, costs, demeaning, binary cache |
| `src/lib/markets/perp-evaluate.ts` | Objectives, combination scoring, null models |
| `src/lib/markets/perp-positioning-history.ts` | Historical funding / OI / taker |

### Adding an indicator

One entry in `PERP_SIGNALS`. Both scripts pick it up with no further edits.

```ts
perSymbol({
  name: "myIndicator",
  group: "volume",          // structure | volume | momentum | volatility | attention
  polarity: "directional",  // directional = high means UP; magnitude = high means BIG
  tier: "core",             // core = every category survives; deep = 252+ bars, crypto-heavy
  minBars: 40,
  description: "What it measures and why it might carry information.",
  compute: (bars, ctx) => { /* causal series aligned 1:1 with bars */ },
}),
```

Three rules the harness enforces rather than trusts:

1. **Causality.** `out[i]` may read `bars[0..i]` only. `perp-signals.test.ts`
   recomputes every signal on a truncated prefix and requires an identical
   value. A signal that peeks fails the suite.
2. **Polarity is real.** A `magnitude` signal cannot be scored by `ic` or
   `basket`, and cannot be sign-flipped for a short book. In a combination it
   acts as a **gate**, never as an addend — rank-averaging "this will move" with
   "this will go up" produces a ranking that expresses no position.
3. **`minBars` ≤ 300 for the core tier.** Above that the tradfi book falls out
   of the panel entirely (§5).

### Running

```bash
npx tsx scripts/research/fetch-perp-positioning.ts          # ~20 min, once
npx tsx scripts/research/run-perp-signal-study.ts --horizon 6
npx tsx scripts/research/run-perp-combo-search.ts --horizon 6 --objective ic --reps 200
```

Panels are cached under `tmp/perp-panel/` keyed by a hash of the registry, the
config and the positioning fetch time, so any change invalidates automatically.
First build ~5 min; afterwards seconds.

### The explorer (`/markets/combos`)

An interactive version of the same scoring, for finding candidates before
committing a 20-minute run to them.

```bash
npx tsx scripts/research/export-combo-explorer.ts --horizon 6 --stride 4
```

writes a quantized slice of the panel to the database; `/markets/combos` fetches
it once and scores combinations **in the browser** as you tick indicators.

Why it can be interactive: combination scoring never touches raw indicator
values. It averages cross-sectional **rank-z** columns and sorts. A rank lives in
[−1, 1], so int16 carries it at 1/32767 — finer than any cross-section is
meaningful at — which turns a 35 MB payload into 2.34 MB. Each combination then
costs a few milliseconds locally.

Measured payload at `--stride 4`, horizon 6: **2.34 MB raw, 2.12 MB gzipped**,
31 signals × 35,033 rows × 96 of 407 cross-sections. Compression barely helps —
ranks are stored in row order, so each column is effectively a random
permutation. `--stride` is the lever: it trades cross-sections for bytes
linearly, so stride 8 roughly halves both.

Int8 would halve it again but is **wrong here**: a cross-section holds ~340
names, so adjacent rank-z values differ by 0.0059 while int8 resolves only
0.0079. It would silently merge adjacent ranks into ties.

**Its numbers are indicative, not authoritative.** The export is downsampled in
time (`--stride`), has no sealed holdout and no bootstrap null. Use it to find
candidates; confirm them with `run-perp-combo-search.ts`. The page says this
above every number.

Downsampling is in **time**, never in symbols — dropping symbols would shrink
each cross-section, which changes what a rank-z means. Dropping whole timestamps
leaves every survivor intact.

`combo-explorer.test.ts` is the **divergence guard**: it exports at `stride = 1`
and asserts the browser scorer matches `evaluateCombo` on the same combinations.
Two implementations of one definition drift silently otherwise. Continuous
metrics (IC) are held to 2dp; set-membership metrics (capture, basket) to 1dp,
because quantization can flip a near-tie and swap one name in a top-N cut.

`run-perp-combo-search.ts` also writes its results to `perp_combo_results` —
the frontier, the champion and the top 200 — which the same page lists as
confirmed runs. Pass `--no-persist` to skip.

### The three objectives

| Objective | Question | Use it when |
| --- | --- | --- |
| `ic` | Is the ordering right? | **Default.** Uses the whole cross-section, so it needs the least data to separate skill from noise |
| `capture` | Did the shortlist contain the movers? | The product-fit metric — the message is a list a human reads |
| `basket` | Did the top 10 make money? | The money question, but a top-10 mean over ~100 timestamps is high-variance and will select noise |

**Read `ic` first.** The `basket` objective picked a different, non-significant
champion on the first run precisely because of its variance.

---

## 3. Results ledger

Append a row per experiment. Never delete one.

### 3.1 Single signals — horizon 6 bars (1 day), entry lag 1, 2026-08-11

407 timestamps · 149,991 rows · 546 symbols. Bonferroni |t| > 2.807.

| Signal | Group | IC | t | Verdict |
| --- | --- | --- | --- | --- |
| `rsiRaw` | momentum | −0.041 | −7.23 | survives (negative → reversal) |
| `mcdNet` | incumbent | −0.030 | −6.65 | survives (negative) |
| `rev6VolAdj` | momentum | +0.037 | +6.58 | survives (positive) |
| `shippedScore` | incumbent | −0.027 | −5.60 | survives (negative) |
| `momVolAdj` | momentum | −0.031 | −5.49 | survives (negative) |
| `roc42` / `roc6` / `roc18` | momentum | ≈ −0.032 | ≈ −5 | survives (negative) |
| `rev6` | momentum | +0.032 | +4.93 | survives (positive) |
| `obvSlope` | volume | −0.020 | −4.30 | survives (negative) |
| `upDownVol` | volume | −0.019 | −4.26 | survives (negative) |
| `pos50` | structure | −0.017 | −3.16 | survives (negative) |
| `maStack` | structure | +0.021 | +2.68 | nominal only |
| `fundingPctl` | attention | −0.006 | −1.53 | no |
| `qvwapDist` | structure | −0.000 | −0.03 | no |

**Every momentum signal is significantly negative and every reversal signal
significantly positive.** At a 1-day horizon on perps, recent strength predicts
weakness. The screen was pointed the wrong way.

Magnitude signals, capture lift (null is the volatility family's best, **3.44×**,
not 1.0× — volatility predicts volatility):

| Signal | Lift | vs null |
| --- | --- | --- |
| `atrPct` | 3.44× | — (it *is* the null) |
| `volOfVol` | 2.56× | −0.88 |
| `rvolZ` | 2.29× | −1.15 |
| `volPctl252` | 2.13× | −1.31 |
| `bbWidthPctl120` | 2.02× | −1.42 |
| `fundingAbs` | 1.97× | −1.47 |
| `rvol` / `volSurge` | 1.96× | −1.48 |
| `dollarVolPctl` | 1.62× | −1.82 |

**No volume or attention magnitude signal beats raw ATR at finding movers.** The
volatility bucket contributes a benchmark, not a signal.

### 3.2 Execution-lag sensitivity — horizon 6, 2026-08-11

How much of each edge is bid-ask bounce rather than alpha:

| Signal | No lag | 1-bar lag | Retained |
| --- | --- | --- | --- |
| `rev6VolAdj` | 0.053 | 0.037 | 70% |
| `rev6` | 0.052 | 0.032 | 62% |
| `rsiRaw` | −0.055 | −0.041 | 75% |
| `mcdNet` | −0.040 | −0.030 | 75% |
| `shippedScore` | −0.037 | −0.027 | 73% |
| `maStack` | +0.017 | +0.021 | 124% |

Reversal loses ~30–38% to one bar of lag but **survives**. The haircut is
uniform across signals, so it is general one-bar autocorrelation rather than
something specific to reversal. `maStack` improves with lag, as a slow
structural signal should.

**Consequence for older work:** `run-perp-convergence-backtest.ts` enters at the
same close it reads the signal from, so every short-horizon number it has
printed carries roughly this one-third inflation.

### 3.3 Combination search — horizon 6, objective `ic`, 2026-08-11

4,663 combinations on TRAIN (284 timestamps), holdout 122, embargo 1.
Exhaustive to k=3, greedy to k=5 seeded from the top five k=3 sets.

| k | Effective rank | Best set | Train | Holdout |
| --- | --- | --- | --- | --- |
| 1 | 1.00 | `rev6VolAdj` | 0.0332 | 0.0390 |
| 2 | 1.90 | `rvol + rev6` | 0.0791 | 0.0888 |
| 3 | 2.90 | **`rvol + rev6 + fundingAbs`** | 0.0823 | 0.0783 |
| 4 | 3.45 | `volSurge + rev6 + rangeExpansion + fundingAbs` | 0.0826 | 0.0847 |
| 5 | 3.11 | `rvol + rev6 + fundingAbs + volSurge + rangeExpansion` | 0.0831 | 0.0849 |

Holdout cells above are **selection-contaminated** (read once per k). The
champion below is the honest number: k chosen by walk-forward inside train, then
the holdout opened once.

**Champion `rvol + rev6 + fundingAbs`:**

- Holdout IC **0.078**, t = **5.97**, 117 timestamps
- Procedure-level bootstrap null: best real 0.0831 vs null median 0.0299,
  **p = 0.005 ± 0.010** (200/200 usable draws)
- Holdout capture 3.55× · basket excess +0.058% (t = 0.15) · absolute −0.044%
  vs buy-everything −0.102% · dateWin 46.2%
- Incumbent `shippedScore` on the same rows: **IC −0.027**

**Minimum indicators: 2–3.** The curve flattens hard after k=2 (0.089) and k=5
buys nothing (0.085). Effective rank 2.90 confirms three genuinely independent
bets rather than three spellings of one.

**The winning set takes one indicator from each of three buckets — volume,
momentum, attention — and zero from price structure.** Structure is the bucket
the existing screen already saturates.

### 3.4 Template for the next entry

```
### 3.N  <what was tested> — horizon <h>, objective <obj>, <YYYY-MM-DD>

Panel:      <rows> rows · <symbols> symbols · <timestamps> timestamps · <crypto %>
Registry:   <signals searched>, <excluded and why>
Search:     <combinations>, exhaustive to k=<n>, holdout <n> timestamps

| k | effRank | best set | train | holdout |

Champion:   <set>
            holdout <objective> <value>, t = <t>
            procedure null p = <p> ± <mc>, <usable>/<reps> draws
            basket <x>% (t = <t>), absolute <x>% vs baseline <x>%
Verdict:    <shipped | rejected | inconclusive> — <one line>
```

---

## 4. Bugs this work found

Recorded because each was invisible until something specific was measured.

| Bug | How it showed | Where |
| --- | --- | --- |
| Rank-z was very slightly asymmetric | `(r/(n−1))·2−1` and its mirror differ by one ULP, because `r/(n−1)` and `(n−1−r)/(n−1)` do not sum to exactly 1. Capture flags on \|score\|, so a meaningless last bit decided which of two equally extreme names entered the top decile — on ~10% of timestamps | `perp-evaluate.ts` and `convergence-screen.ts`, now `(2r−(n−1))/(n−1)` |
| Look-ahead in the evaluator | All 11 magnitude signals posted an identical 8.87× lift — the flagged set was ranked by \|forward return\|, the outcome itself | `perp-evaluate.ts`, fixed; regression test in `perp-evaluate.test.ts` |
| `maStack` was `distSmma200` | Both printed the same value in every column: `log(px/a)+log(a/b)+log(b/c)` telescopes to `log(px/c)` | `perp-signals.ts`, now the weakest rung. **`signals.ts:125` has the same flaw for equities** |
| Fabricated p-value | Permuted returns carried NaN, every null draw degenerated, p collapsed to `1/(reps+1)` = 0.010 | `perp-evaluate.ts`, fixed; the report now warns when draws are degenerate |
| NaN comparator | `-Infinity - -Infinity` is NaN and `NaN !== 0` is true, so `sort` got undefined behaviour | `convergence-screen.ts` `rankPicks`, fixed |
| Funding undercharged ~2× | Measured intervals are **4h ×412, 8h ×264, 1h ×4**; `BARS_PER_FUNDING = 2` assumes 8h for all | `run-perp-convergence-backtest.ts`, still present |
| Full-sample mean funding | Charged at every historical timestamp, leaking future funding into the cost model | `perp-panel.ts` uses realized-over-window; old script unchanged |

---

## 5. Limits — read before trusting any number above

- **The panel is 99.6% crypto.** At horizon 6: crypto 147,727 rows, equity 634,
  premarket / commodity / index **zero**. Nothing here speaks to the tradfi book,
  which is a large part of why the screen exists. Category counts are printed
  before every result.
- **Open interest cannot be tested.** Probed live: `openInterestHist` and
  `takerlongshortRatio` serve **30.8 days**, and `startTime` beyond that returns
  HTTP 400. That is 5.3% coverage, so all four OI/taker signals — including
  `oiChangeAbs`, the *previous* ranking key — are excluded for coverage. The
  1.89× lift once quoted for it has never been reproduced on a deep sample.
  Funding is different: `startTime` paging reaches 458 days.
- **Excess is gross of fees.** A cross-sectionally constant round-trip fee is
  removed exactly by demeaning, so only funding survives into `excess`. Judge
  short-horizon winners on the absolute line.
- **Slippage is not modelled.** The $250k/bar floor bounds it, does not price it.
  A 1-day reversal signal selects names that just gapped — the widest spreads in
  the book at the moment of entry.
- **Survivorship.** The cache holds surviving listings' history, so early
  timestamps carry a systematically older, larger universe. This biases momentum
  and volume signals upward specifically.
- **Pre-selection.** `rev6` and the squeeze signals are in the registry *because*
  earlier work pointed at reversal and compression. The p-value covers the
  registered set, not the programme that chose it.
- **`shippedScore` is not a clean incumbent.** Its `vwapWeight = 2` and
  `minScore = 5` were tuned on this same data, so "beat the incumbent" is a
  weaker bar than it reads.
- **The holdout is finite.** `scripts/research/.holdout-ledger` counts every
  time it has been opened. Each open costs some of its value.

---

## 6. Open questions, roughly by value

1. **Should the convergence gate exist at all?** It carries a measured IC of
   −0.027. Test the composite over the whole liquid universe with no score gate,
   against the current gated version. This is the highest-value open question and
   the composite is currently extrapolated across it.
2. **Does any of this hold at horizon 18 (3 days)?** Searchable (167 timestamps,
   50 holdout) and untested. Horizons 42 and 90 fail the `MIN_EFF_N = 20` gate.
3. **Does it hold on the tradfi book?** Needs a separate panel with a lower
   `minBars` and a crypto exclusion, or it will always be 99.6% crypto.
4. **Bank OI history.** A daily snapshot into a table makes the attention bucket
   answerable in a few months. `tmp/perp-backtest/oi.json` already holds one
   30-day pull. Until then no OI claim can be tested.
5. **Turnover and slippage.** `PanelConfig` supports the robustness sweeps
   (`gridPhase`, `liquidityFloor`) but no runner is wired.
6. **Extract the shared core.** `run-perp-convergence-backtest.ts` still
   duplicates the replay logic. `LEGACY_CONFIG` in `perp-panel.ts` exists to make
   the extraction output-identical; the extraction itself is not done.
