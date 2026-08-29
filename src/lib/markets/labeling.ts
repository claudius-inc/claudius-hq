/**
 * Turns recorded screen picks into forward-return labels, automatically.
 *
 * The screens already persist every candidate with an entry price and date
 * (momentum_report_picks, crypto_screen_picks), so measuring what happened next
 * needs no human input at all — only a job that joins picks to prices.
 *
 * TWO RULES THAT DRIVE EVERYTHING HERE
 *
 * 1. Returns live entirely inside the adjusted series: exit_adj / entry_adj.
 *    A k:1 split scales both legs identically and cancels, so labels are
 *    split-invariant even though production records a RAW entry price
 *    (watchlist-fetcher.ts reads q.close). Dividing exit_adj by entry_raw
 *    would reintroduce exactly the artifact this avoids.
 *
 * 2. An anomaly is a DISAGREEMENT BETWEEN MEASUREMENTS, never a large move.
 *    The tempting rule — "flag anything that moved more than 60% in a week" —
 *    cannot catch splits (see rule 1) and would instead flag the genuine big
 *    winners. In a right-skewed return distribution those few names carry much
 *    of the mean, so quarantining them would bias every downstream statistic
 *    downward AND teach the live screen to avoid its best outcomes. Magnitude
 *    is not evidence of a defect; two data sources contradicting each other is.
 */

export interface LabelBar {
  d: string; // YYYY-MM-DD
  h: number;
  l: number;
  c: number; // raw close
  a: number; // adjusted close
}

export type LabelStatus =
  | "pending"
  | "labeled"
  | "partial_delist"
  | "no_data"
  | "currency_change"
  | "anomaly";

export interface LabelResult {
  status: LabelStatus;
  entryAdj: number | null;
  exitAdj: number | null;
  exitDate: string | null;
  fwdPct: number | null;
  anomalyNote: string | null;
}

/** Dividends make raw and adjusted returns diverge legitimately. Anything
 *  beyond this over a short window implies a split/data defect instead. A
 *  generous ceiling: even a fat quarterly yield rarely reaches 5% in one go. */
const DIVIDEND_TOLERANCE_PCT = 6;

/**
 * Index of the first bar on or after `date`. Returns -1 when the ticker has no
 * such bar. Using the ticker's OWN bar array is what makes per-exchange
 * holidays a non-issue: a name that did not trade that day simply starts at its
 * next session rather than silently misaligning against a global calendar.
 */
export function findEntryIndex(bars: LabelBar[], date: string): number {
  for (let i = 0; i < bars.length; i++) if (bars[i].d >= date) return i;
  return -1;
}

/**
 * Did the recorded entry price plausibly trade?
 *
 * `momentum_report_picks.price` comes from `ticker_metrics.price`, which is an
 * INTRADAY scan price that the report's freshness gate accepts for up to four
 * days. So comparing it to the entry-date close and flagging small differences
 * would fire constantly on healthy, volatile names — and selectively on the
 * high-volatility, high-news names, producing label attrition correlated with
 * the outcome being measured. Checking it against the bar's traded RANGE (with
 * a little slack for the stale-scan case) tests the thing that actually matters:
 * whether the number is real.
 */
export function entryPriceImplausible(
  storedPrice: number | null,
  bar: LabelBar | undefined,
  slackPct = 15,
): boolean {
  if (storedPrice === null || !bar) return false;
  const lo = bar.l * (1 - slackPct / 100);
  const hi = bar.h * (1 + slackPct / 100);
  return storedPrice < lo || storedPrice > hi;
}

/**
 * Raw and adjusted returns disagreeing by more than dividends can explain.
 * This is the split/data-defect detector — magnitude plays no part.
 */
export function seriesDisagree(
  entry: LabelBar,
  exit: LabelBar,
): { disagree: boolean; rawPct: number; adjPct: number } {
  const rawPct = entry.c ? (100 * (exit.c - entry.c)) / entry.c : 0;
  const adjPct = entry.a ? (100 * (exit.a - entry.a)) / entry.a : 0;
  return {
    disagree: Math.abs(rawPct - adjPct) > DIVIDEND_TOLERANCE_PCT,
    rawPct,
    adjPct,
  };
}

export interface LabelInput {
  bars: LabelBar[];
  entryDate: string;
  horizon: number;
  storedPrice: number | null;
  /** Calendar days that must elapse before a missing forward bar is treated as
   *  a delisting rather than as data simply not having arrived yet. */
  graceDays?: number;
  today: string;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Label one pick. Pure — all I/O happens in the caller.
 *
 * Ordering matters: defect checks run BEFORE the return is accepted, so a
 * corrupted series never contributes a number to any statistic.
 */
export function labelPick(input: LabelInput): LabelResult {
  const { bars, entryDate, horizon, storedPrice, today, graceDays = 15 } = input;
  const nil = (status: LabelStatus, note: string | null = null): LabelResult => ({
    status,
    entryAdj: null,
    exitAdj: null,
    exitDate: null,
    fwdPct: null,
    anomalyNote: note,
  });

  if (!bars.length) return nil("no_data", "no bars");

  const ei = findEntryIndex(bars, entryDate);
  if (ei < 0) {
    // No bar on or after the entry date at all. Only conclude "gone" once
    // enough time has passed that the data really should exist by now.
    return daysBetween(entryDate, today) > graceDays
      ? nil("no_data", "no bar on or after entry date")
      : nil("pending");
  }

  const entry = bars[ei];
  if (!entry.a || entry.a <= 0) return nil("no_data", "entry has no adjusted close");

  if (entryPriceImplausible(storedPrice, entry)) {
    return nil(
      "anomaly",
      `stored price ${storedPrice} outside traded range ${entry.l}-${entry.h} on ${entry.d}`,
    );
  }

  const xi = ei + horizon;
  const haveFullWindow = xi < bars.length;

  // Not enough forward bars yet. Distinguish "the window has not elapsed" from
  // "this stopped trading" using calendar time, converting trading days to
  // calendar days at 7/5 plus a grace margin.
  if (!haveFullWindow) {
    const dueAfter = Math.ceil((horizon * 7) / 5) + graceDays;
    if (daysBetween(entryDate, today) < dueAfter) return nil("pending");

    const lastIdx = bars.length - 1;
    if (lastIdx <= ei) return nil("no_data", "no bars after entry");

    // Delisted or halted mid-window. Label at the last available price and
    // INCLUDE it: dropping names that stopped trading is survivorship bias,
    // and it flatters the screen precisely where its picks went worst.
    const exit = bars[lastIdx];
    const check = seriesDisagree(entry, exit);
    if (check.disagree) {
      return nil("anomaly", `raw ${check.rawPct.toFixed(1)}% vs adj ${check.adjPct.toFixed(1)}%`);
    }
    return {
      status: "partial_delist",
      entryAdj: entry.a,
      exitAdj: exit.a,
      exitDate: exit.d,
      fwdPct: check.adjPct,
      anomalyNote: `only ${lastIdx - ei} of ${horizon} bars available`,
    };
  }

  const exit = bars[xi];
  if (!exit.a || exit.a <= 0) return nil("no_data", "exit has no adjusted close");

  const check = seriesDisagree(entry, exit);
  if (check.disagree) {
    return nil(
      "anomaly",
      `raw ${check.rawPct.toFixed(1)}% vs adj ${check.adjPct.toFixed(1)}% — split or data defect`,
    );
  }

  return {
    status: "labeled",
    entryAdj: entry.a,
    exitAdj: exit.a,
    exitDate: exit.d,
    fwdPct: check.adjPct,
    anomalyNote: null,
  };
}

/**
 * Cohort statistics for one entry date.
 *
 * `partial_delist` rows are included: they are real outcomes, and excluding
 * them is the survivorship bias that makes a screen look better than it was.
 * Defect rows (anomaly / no_data / currency_change) are excluded because their
 * numbers are not trustworthy, and their count is reported separately as
 * attrition so the exclusion cannot hide a growing data problem.
 */
export function cohortStats(
  labels: { status: LabelStatus; fwdPct: number | null }[],
): { n: number; mean: number | null; attrition: number } {
  const usable = labels.filter(
    (l) => (l.status === "labeled" || l.status === "partial_delist") && l.fwdPct !== null,
  );
  const defects = labels.filter(
    (l) => l.status === "anomaly" || l.status === "no_data" || l.status === "currency_change",
  ).length;
  return {
    n: usable.length,
    mean: usable.length ? usable.reduce((a, b) => a + (b.fwdPct as number), 0) / usable.length : null,
    attrition: labels.length ? (100 * defects) / labels.length : 0,
  };
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

export interface CryptoPricePoint {
  d: string; // YYYY-MM-DD
  p: number;
}

export interface CryptoLabelInput {
  /** Daily closes for one coin, ascending by date. */
  points: CryptoPricePoint[];
  runDate: string;
  /** CALENDAR days — crypto trades 24/7, so there is no trading-day concept. */
  horizonDays: number;
  storedPrice: number | null;
  today: string;
  /** A daily snapshot can miss a day; accept a nearby bar rather than voiding
   *  the label. */
  toleranceDays?: number;
  graceDays?: number;
}

/** Nearest point to `target` within `tolerance` days, preferring on/after. */
function nearestPoint(
  points: CryptoPricePoint[],
  target: string,
  tolerance: number,
): CryptoPricePoint | null {
  let best: CryptoPricePoint | null = null;
  let bestGap = Infinity;
  for (const pt of points) {
    const gap = Math.abs(Math.round((Date.parse(pt.d) - Date.parse(target)) / 86_400_000));
    if (gap <= tolerance && gap < bestGap) {
      best = pt;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Label one crypto pick.
 *
 * THE BIAS THIS EXISTS TO AVOID: the price spine (crypto_prices_daily) is
 * written from the same top-1000 pull the screen uses, so a coin that
 * COLLAPSES falls below the rank cutoff and simply stops having rows. A naive
 * join would then drop exactly the worst outcomes — amputating the left tail of
 * a breakout screen, which is where such screens actually die. The caller is
 * therefore expected to backfill missing points with a direct per-coin fetch;
 * this function's part of the contract is to label at the last known price
 * rather than return nothing when the series ends early.
 *
 * The anomaly test is the crypto analogue of raw-vs-adjusted disagreement: the
 * stored pick price and the price spine are written from the SAME API response
 * in the same run, so they must agree. A material mismatch means one of the two
 * writes is corrupt.
 */
export function labelCryptoPick(input: CryptoLabelInput): LabelResult {
  const {
    points, runDate, horizonDays, storedPrice, today,
    toleranceDays = 2, graceDays = 3,
  } = input;

  const nil = (status: LabelStatus, note: string | null = null): LabelResult => ({
    status, entryAdj: null, exitAdj: null, exitDate: null, fwdPct: null, anomalyNote: note,
  });

  if (!points.length) return nil("no_data", "no price points");

  const sorted = [...points].sort((a, b) => a.d.localeCompare(b.d));
  const entry = nearestPoint(sorted, runDate, toleranceDays);
  if (!entry || entry.p <= 0) return nil("no_data", "no usable entry price");

  if (storedPrice !== null && storedPrice > 0) {
    const divergence = Math.abs(entry.p - storedPrice) / storedPrice;
    if (divergence > 0.05) {
      return nil(
        "anomaly",
        `stored price ${storedPrice} vs spine ${entry.p} on ${entry.d} — write disagreement`,
      );
    }
  }

  const targetExit = new Date(Date.parse(runDate) + horizonDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const elapsed = Math.round((Date.parse(today) - Date.parse(runDate)) / 86_400_000);

  const exit = nearestPoint(sorted, targetExit, toleranceDays);
  if (exit && exit.p > 0) {
    return {
      status: "labeled",
      entryAdj: entry.p,
      exitAdj: exit.p,
      exitDate: exit.d,
      fwdPct: (100 * (exit.p - entry.p)) / entry.p,
      anomalyNote: null,
    };
  }

  // Window has not elapsed yet — genuinely nothing to say.
  if (elapsed < horizonDays + graceDays) return nil("pending");

  // Past due with no exit point. The coin left the tracked universe, which for
  // a top-1000-by-market-cap spine overwhelmingly means it fell out rather than
  // rose out. Label at the last known price and INCLUDE it; dropping these is
  // the survivorship bias this whole function exists to prevent.
  const last = sorted[sorted.length - 1];
  if (last.d <= entry.d || last.p <= 0) return nil("no_data", "no price after entry");

  return {
    status: "partial_delist",
    entryAdj: entry.p,
    exitAdj: last.p,
    exitDate: last.d,
    fwdPct: (100 * (last.p - entry.p)) / entry.p,
    anomalyNote: `left tracked universe after ${last.d}; labelled at last known price`,
  };
}

export type QuarantineReason =
  | "split_artifact"
  | "stale_feed"
  | "delisted"
  | "currency_change";

/**
 * Which confirmed defects justify quarantining a ticker.
 *
 * Deliberately excludes every magnitude-based trigger. `partial_delist` alone
 * is NOT a quarantine either — a name can be halted briefly and resume.
 */
export function quarantineReasonFor(
  status: LabelStatus,
  note: string | null,
): { reason: QuarantineReason; expiresInDays: number | null } | null {
  if (status === "anomaly") {
    if (note?.includes("split or data defect")) return { reason: "split_artifact", expiresInDays: 60 };
    if (note?.includes("outside traded range")) return { reason: "stale_feed", expiresInDays: 60 };
    return null;
  }
  if (status === "currency_change") return { reason: "currency_change", expiresInDays: 60 };
  if (status === "no_data") return { reason: "delisted", expiresInDays: null };
  return null;
}

// ---------------------------------------------------------------------------
// Perps (Binance)
// ---------------------------------------------------------------------------
//
// The convergence screen persists every candidate with an entry price and an
// as-of bar-close, exactly like the other two screens, but it had no labeller —
// so the daily perp list has run with no forward-return record at all, and "did
// the screen work?" could only be answered by hand. This closes that gap.
//
// Two things differ from the crypto path and drive the shape below:
//
//  1. Perps have no splits or dividends, so raw IS adjusted. There is no
//     adjusted series to divide by and no split artifact to cancel — the
//     anomaly test collapses to a single stored-vs-observed price check.
//  2. Entry is matched on the 4h bar CLOSE, not a calendar date. The pick's
//     `as_of` is the close of the scored bar, so the label must measure from
//     that exact bar and not from a day boundary — a perp trades every hour and
//     "the close on run_date" is not a defined thing.
//
// fwd_pct is stored RAW and UNSIGNED — the price return of the contract, same
// convention as momentum/crypto. The pick's side lives in
// perp_convergence_picks and a study signs by it there; baking the side in here
// would make this column mean something different from the other two sources.

/** One 4h perp bar, reduced to what a label needs. `tClose` is epoch ms. */
export interface PerpLabelBar {
  tClose: number;
  c: number;
}

export interface PerpLabelInput {
  /** Ascending by `tClose`. */
  bars: PerpLabelBar[];
  /** Close time of the scored (entry) bar, epoch ms — the pick's `as_of`. */
  asOfMs: number;
  /** CALENDAR days — perps trade 24/7, so there is no trading-day concept. */
  horizonDays: number;
  storedPrice: number | null;
  nowMs: number;
  /** Hours a forward bar may sit either side of the target before it is
   *  rejected. One 4h bar of slack absorbs ordinary settlement jitter. */
  toleranceHours?: number;
  /** Hours past the horizon to wait before a missing forward bar is read as a
   *  delisting rather than as data not having arrived yet. */
  graceHours?: number;
}

const H4_MS = 14_400_000;

/** Bar whose `tClose` is nearest `targetMs`, within `toleranceMs`, else null. */
function nearestBar(bars: PerpLabelBar[], targetMs: number, toleranceMs: number): PerpLabelBar | null {
  let best: PerpLabelBar | null = null;
  let bestGap = Infinity;
  for (const b of bars) {
    const gap = Math.abs(b.tClose - targetMs);
    if (gap <= toleranceMs && gap < bestGap) {
      best = b;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Label one perp pick against its own 4h bars.
 *
 * The caller fetches the bars (Binance klines, which is why this only ever runs
 * on the venue-permitted VPS and never in CI) and owns the DB I/O; this part is
 * pure so it can be tested without a network.
 */
export function labelPerpPick(input: PerpLabelInput): LabelResult {
  const {
    bars, asOfMs, horizonDays, storedPrice, nowMs,
    toleranceHours = 4, graceHours = 8,
  } = input;
  const tol = toleranceHours * 3_600_000;

  const nil = (status: LabelStatus, note: string | null = null): LabelResult => ({
    status, entryAdj: null, exitAdj: null, exitDate: null, fwdPct: null, anomalyNote: note,
  });

  if (!bars.length) return nil("no_data", "no bars");

  const sorted = [...bars].sort((a, b) => a.tClose - b.tClose);
  // Entry may sit up to a full bar out: the screen scores the last CLOSED bar,
  // and a re-run minutes later can shift `as_of` by one interval.
  const entry = nearestBar(sorted, asOfMs, H4_MS + tol);
  if (!entry || entry.c <= 0) return nil("no_data", "no usable entry bar");

  // The only anomaly a splitless series can carry: the price the screen banked
  // and the venue's own bar for that moment disagree, which means one write is
  // corrupt. 5% is wide enough to absorb a one-bar timing mismatch on a fast
  // name and narrow enough to catch a genuinely wrong number.
  if (storedPrice !== null && storedPrice > 0) {
    const divergence = Math.abs(entry.c - storedPrice) / storedPrice;
    if (divergence > 0.05) {
      return nil("anomaly", `stored price ${storedPrice} vs bar ${entry.c} — write disagreement`);
    }
  }

  const targetExitMs = entry.tClose + horizonDays * 86_400_000;
  const exit = nearestBar(sorted, targetExitMs, tol);
  if (exit && exit.c > 0) {
    return {
      status: "labeled",
      entryAdj: entry.c,
      exitAdj: exit.c,
      exitDate: new Date(exit.tClose).toISOString().slice(0, 10),
      fwdPct: (100 * (exit.c - entry.c)) / entry.c,
      anomalyNote: null,
    };
  }

  // Horizon not reached yet — nothing to say.
  if (nowMs - asOfMs < horizonDays * 86_400_000 + graceHours * 3_600_000) return nil("pending");

  // Past due with no bar at the horizon. For a perp this means the contract was
  // delisted mid-window; label at the last bar that exists rather than dropping
  // the outcome, which — as with the crypto path — would delete exactly the
  // names that died.
  const last = sorted[sorted.length - 1];
  if (last.tClose <= entry.tClose || last.c <= 0) return nil("no_data", "no bar after entry");
  return {
    status: "partial_delist",
    entryAdj: entry.c,
    exitAdj: last.c,
    exitDate: new Date(last.tClose).toISOString().slice(0, 10),
    fwdPct: (100 * (last.c - entry.c)) / entry.c,
    anomalyNote: `no bar at horizon; labelled at last bar ${new Date(last.tClose).toISOString().slice(0, 10)}`,
  };
}
