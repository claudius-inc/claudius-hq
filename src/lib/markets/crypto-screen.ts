/**
 * Selection logic for the daily "Crypto Movers" Telegram report.
 *
 * Two lenses over one CoinGecko top-1000 pull:
 *   - momentum (top 200 only): durable uptrend that is beating BTC
 *   - breakout (full top 1000): moving today with real week/month structure
 * A coin can pass either or both; both-flagged coins rank first.
 *
 * The screen previously lived inline in .github/workflows/crypto-report.yml as
 * a `node -e '...'` string, which made it untestable and unable to contain an
 * apostrophe. The pure functions here are unit-testable; the orchestration
 * lives in scripts/pipelines/run-crypto-report.ts.
 */

export interface RawCoin {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number | null;
  total_volume?: number | null;
  market_cap?: number | null;
  fully_diluted_valuation?: number | null;
  ath_change_percentage?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  sparkline_in_7d?: { price?: number[] } | null;
}

export interface SparkStats {
  last24Share: number;
  ddFromHigh: number;
  risingFrac: number;
}

export interface Coin {
  rank: number;
  id: string;
  sym: string;
  name: string;
  price: number | null;
  vol: number | null;
  mcap: number | null;
  fdv: number | null;
  athc: number | null;
  p24: number | null;
  p7: number | null;
  p30: number | null;
  spark: SparkStats | null;
}

export interface ScreenedCoin extends Coin {
  tag: "both" | "momentum" | "breakout";
  emoji: string;
  score: number;
  both: boolean;
}

export const SCREEN_CONFIG = {
  minVol: 5_000_000, // liquidity floor, shared by both lenses
  minMcap: 100_000_000, // rank ~1000 is a $30-50M coin on $5M volume
  maxTurnover: 1.5, // vol > 1.5x mcap in the tail is predominantly wash trading
  minFloat: 0.5, // mcap/FDV — low-float pumps die on unlocks

  // Breakout lens. Previously MIN_24=8 / MAX_24=60 / MIN_7=15 / MIN_30=10 with
  // NO upper bound on the week or month, so coins already up 120-290% over 7
  // days counted as fresh breakouts. Caps added; the daily floor is lowered
  // because the cross-sectional gates below now carry the selectivity.
  min24: 2,
  max24: 25,
  min7: 8,
  max7: 60,
  min30: 5,
  max30: 150,

  // Sparkline shape gates. The old values were near-vacuous: with MIN_24=8 and
  // MIN_7=15 a typical last24Share is ~0.5, so a 0.9 cap only ever tripped
  // single-candle extremes, and any +15% week clears risingFrac 0.5 by
  // construction.
  max24Share: 0.6,
  minRising: 0.6,
  maxDd: -0.07,
  maxPop24: 12, // absolute daily pop that marks a move as a spike

  // Base-drift tolerance for p30ex7, which is algebraically `p30 >= p7 + drift`.
  //
  // Requiring p30ex7 >= 0 on the BREAKOUT lens was a design error: it reduces
  // to p30 >= p7, so a coin that consolidated flat for three weeks and then
  // broke out +12% this week (p30 ~ +8.6) was rejected — the canonical fresh
  // breakout is exactly the shape the lens excluded, leaving it able to admit
  // only "week <= month" continuation, i.e. a second momentum lens. A small
  // negative tolerance admits breakouts from a flat base while still rejecting
  // bounces inside downtrends (a -20% month with a +25% week is p30ex7 ~ -36).
  breakoutBaseDrift: -5,
  momentumBaseDrift: 0, // momentum lens keeps the strict "already trending" rule

  // Cross-sectional percentiles. Every gate used to be an absolute return
  // level, which made the screen pro-cyclical — it overflowed in froth and went
  // empty in drawdowns, i.e. it was loosest exactly when recent-gainer forward
  // returns are worst. Requiring a coin to beat its own peer group normalizes
  // for regime.
  q24Pctl: 0.6,
  q7Pctl: 0.8,

  // Momentum lens floors. "Beats BTC" alone is a near-zero bar on a flat or
  // down BTC week: with BTC 7d at -0.5%, coins up 1.2% on the week were
  // qualifying as momentum names. An absolute floor plus a cross-sectional one
  // means the coin has to be genuinely moving AND beating its peers, not just
  // drifting less badly than BTC.
  min7M: 3,
  q7MPctl: 0.7,

  topN: 10,
} as const;

export const STABLE = new Set([
  "USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USD1", "PYUSD", "BUSD",
  "USDD", "GUSD", "FRAX", "LUSD", "USDP", "CRVUSD", "RLUSD", "USDG", "USDX",
  // Non-USD pegs and tokenized commodities. On a dollar slide or a gold rally
  // these clear the |p30| >= 2 test below and would otherwise pass the momentum
  // lens as if they were genuine movers.
  "EURC", "EURS", "EURT", "EURI", "XAUT", "PAXG", "XAUM",
]);

export const isStableish = (c: Coin): boolean =>
  STABLE.has(c.sym) ||
  /wrapped|staked|stablecoin|peg|bridged/i.test(c.name) ||
  (Math.abs(c.p30 ?? 0) < 2 && Math.abs(c.p7 ?? 0) < 1);

/** Missing FDV passes rather than silently excluding the coin. */
export const floatRatio = (c: Coin): number =>
  c.fdv && c.fdv > 0 ? (c.mcap ?? 0) / c.fdv : 1;

export const turnoverOf = (c: Coin): number =>
  c.mcap ? (c.vol ?? 0) / c.mcap : 0;

/**
 * Month trend EXCLUDING the last week — "how was this doing before this week?".
 * Kills bounces inside downtrends and week-old verticals that only look strong
 * because of the last 7 days.
 *
 * Note this is monotone in (p30 - p7): requiring `p30ex7 >= 0` is exactly
 * `p30 >= p7`. Callers should pass a small negative tolerance when they want to
 * allow a breakout from a flat base rather than demand prior trend.
 */
export const p30ex7 = (c: Coin): number =>
  ((1 + (c.p30 ?? 0) / 100) / (1 + (c.p7 ?? 0) / 100) - 1) * 100;

/** Characterize the 7d hourly sparkline: sustained move, or a spike? */
export function sparkStats(px: number[] | undefined | null): SparkStats | null {
  if (!px || px.length < 48) return null;
  const n = px.length;
  const last = px[n - 1];
  const first = px[0];
  const hi = Math.max(...px);
  const k = Math.min(24, n - 1);
  const gain7d = last - first;
  const gain24h = last - px[n - 1 - k];

  // When gain7d <= 0 the ratio flips sign (or explodes near zero) and silently
  // passes every share test, so a flat/down week is treated as "all of the move
  // is today" rather than dividing by it.
  const last24Share = gain7d > 0 ? Math.max(0, gain24h) / gain7d : 1;
  const ddFromHigh = (last - hi) / (hi || 1);

  let rising = 0;
  let total = 0;
  for (let i = Math.max(6, n - 72); i < n; i++) {
    total++;
    if (px[i] > px[i - 6]) rising++;
  }
  return { last24Share, ddFromHigh, risingFrac: total ? rising / total : 0 };
}

/**
 * Real spike test, replacing the old clause
 *   !(p24 > 0 && p7 > 0 && p24 > 0.6 * p7)
 * which — because `p7 > 0` was already required upstream — reduced to
 * "exclude iff p24 > 0.6 * p7". A coin that popped mid-week and is bleeding
 * today has p24 <= 0, so that clause could never exclude it: the screen
 * actively favoured post-spike decay. It also rejected harmless names on pure
 * ratio noise whenever p7 was near zero.
 */
export function spikey(c: Coin, cfg = SCREEN_CONFIG): boolean {
  const s = c.spark;
  if ((c.p24 ?? 0) > cfg.maxPop24) return true; // absolute daily pop
  // No sparkline means no shape evidence. Treat that as disqualifying rather
  // than as a pass: otherwise a coin with a missing/short CoinGecko sparkline
  // slips through the momentum lens with zero shape screening, which is exactly
  // the post-spike-decay hole this function exists to close.
  if (!s) return true;
  if (s.last24Share > cfg.max24Share) return true; // the week is mostly today
  if (s.ddFromHigh < cfg.maxDd) return true; // already fading off the 7d high
  return false;
}

export function normalizeCoins(raw: RawCoin[]): Coin[] {
  // The four pages are fetched sequentially ~2.5s apart and CoinGecko reorders
  // by live market cap between requests, so a coin sitting on a page boundary
  // can come back on two pages. Left undeduped it would appear twice in the
  // reported top 10 and collide on the (coin_id, run_date) upsert. Keep the
  // first (higher-ranked) occurrence.
  const seen = new Set<string>();
  const deduped = raw.filter((c) => {
    const id = c.id ?? "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return deduped.map((c, idx) => ({
    rank: idx + 1,
    id: c.id ?? "",
    sym: String(c.symbol ?? "").toUpperCase(),
    name: c.name ?? "",
    price: c.current_price ?? null,
    vol: c.total_volume ?? null,
    mcap: c.market_cap ?? null,
    fdv: c.fully_diluted_valuation ?? null,
    athc: c.ath_change_percentage ?? null,
    p24: c.price_change_percentage_24h_in_currency ?? null,
    p7: c.price_change_percentage_7d_in_currency ?? null,
    p30: c.price_change_percentage_30d_in_currency ?? null,
    spark: sparkStats(c.sparkline_in_7d?.price),
  }));
}

const athProx = (c: Coin): number =>
  c.athc === null || c.athc === undefined ? 0 : Math.max(0, Math.min(100, 100 + c.athc));

export const compositeM = (c: Coin): number =>
  0.5 * (c.p24 ?? 0) + 0.3 * (c.p7 ?? 0) + 0.2 * (c.p30 ?? 0) + 0.1 * athProx(c);

export const compositeG = (c: Coin): number =>
  athProx(c) * 0.25 +
  ((c.p7 ?? 0) + 0.5 * (c.p30 ?? 0)) * 0.4 +
  Math.min(40, turnoverOf(c) * 100) * 0.3 +
  (c.p24 ?? 0) * 0.25;

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return -Infinity;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

/** Percentile rank of `v` within a pre-sorted array. Binary search, not a rescan. */
export function pctlOf(sorted: number[], v: number): number {
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((100 * lo) / sorted.length);
}

export interface ScreenOutcome {
  universe: Coin[];
  candidates: ScreenedCoin[];
  ranked: ScreenedCoin[];
  passMN: number;
  passGN: number;
  btc: { p24: number | null; p7: number | null; p30: number | null };
  /** True when Bitcoin was absent from the pull — the relative-strength gates
   *  silently degrade to "positive return" and the persisted btc_* regime
   *  context would otherwise be indistinguishable from a genuinely flat BTC. */
  btcMissing: boolean;
}

export function screenCoins(all: Coin[], cfg = SCREEN_CONFIG): ScreenOutcome {
  // Look up by CoinGecko id, not symbol: symbols collide inside the top 1000
  // (which is why coin_id is the storage key), so a symbol match could in
  // principle bind the relative-strength gates to an impostor.
  const btcCoin = all.find((c) => c.id === "bitcoin") ?? all.find((c) => c.sym === "BTC");
  const btcMissing = !btcCoin;
  const btc = {
    p24: btcCoin?.p24 ?? 0,
    p7: btcCoin?.p7 ?? 0,
    p30: btcCoin?.p30 ?? 0,
  };

  const universe = all.filter((c) => !isStableish(c) && (c.vol ?? 0) >= cfg.minVol);

  const s24 = universe.map((c) => c.p24 ?? 0).sort((a, b) => a - b);
  const s7 = universe.map((c) => c.p7 ?? 0).sort((a, b) => a - b);
  const q24 = quantile(s24, cfg.q24Pctl);
  const q7 = quantile(s7, cfg.q7Pctl);
  const q7m = quantile(s7, cfg.q7MPctl);

  const passM = (c: Coin): boolean =>
    c.rank <= 200 &&
    !isStableish(c) &&
    (c.vol ?? 0) >= cfg.minVol &&
    (c.mcap ?? 0) >= cfg.minMcap &&
    // Float and parabola guards used to live only on the breakout lens, so a
    // low-float coin up 187% on the month could still collect a momentum tag.
    floatRatio(c) >= cfg.minFloat &&
    (c.p30 ?? 0) <= cfg.max30 &&
    // Genuinely moving, not merely positive.
    (c.p7 ?? 0) >= cfg.min7M &&
    (c.p7 ?? 0) >= q7m &&
    (c.p24 ?? 0) > -5 &&
    p30ex7(c) >= cfg.momentumBaseDrift &&
    (c.p7 ?? 0) - (btc.p7 ?? 0) > 0 &&
    (c.p30 ?? 0) - (btc.p30 ?? 0) > 0 &&
    !spikey(c, cfg);

  const passG = (c: Coin): boolean => {
    if (isStableish(c)) return false;
    if ((c.vol ?? 0) < cfg.minVol) return false;
    if ((c.mcap ?? 0) < cfg.minMcap) return false;
    if (turnoverOf(c) > cfg.maxTurnover) return false;
    if (floatRatio(c) < cfg.minFloat) return false;

    const p24 = c.p24 ?? 0;
    const p7 = c.p7 ?? 0;
    const p30 = c.p30 ?? 0;
    if (p24 < cfg.min24 || p24 > cfg.max24) return false;
    if (p7 < cfg.min7 || p7 > cfg.max7) return false;
    if (p30 < cfg.min30 || p30 > cfg.max30) return false;
    if (p30ex7(c) < cfg.breakoutBaseDrift) return false;
    if (p24 < q24 || p7 < q7) return false;

    const s = c.spark;
    if (!s) return false;
    if (s.last24Share > cfg.max24Share) return false;
    if (s.risingFrac < cfg.minRising) return false;
    if (s.ddFromHigh < cfg.maxDd) return false;
    return true;
  };

  const compsM = universe.map(compositeM).sort((a, b) => a - b);
  const compsG = universe.map(compositeG).sort((a, b) => a - b);

  let passMN = 0;
  let passGN = 0;

  const candidates = universe
    .map((c): ScreenedCoin | null => {
      const m = passM(c);
      const g = passG(c);
      if (m) passMN++;
      if (g) passGN++;
      if (!m && !g) return null;
      const both = m && g;
      const score = Math.round((pctlOf(compsM, compositeM(c)) + pctlOf(compsG, compositeG(c))) / 2);
      return {
        ...c,
        tag: both ? "both" : m ? "momentum" : "breakout",
        emoji: both ? "⭐" : m ? "📈" : "🚀",
        score,
        both,
      };
    })
    .filter((c): c is ScreenedCoin => c !== null)
    // Explicit tier sort. The old CONF_BONUS = 8 only floated dual-flagged
    // coins up while scores happened to cluster within 8 points; a tier key
    // makes that ordering unconditional.
    .sort((a, b) => Number(b.both) - Number(a.both) || b.score - a.score);

  return {
    universe,
    candidates,
    ranked: candidates.slice(0, cfg.topN),
    passMN,
    passGN,
    btc,
    btcMissing,
  };
}

/** Fetches the CoinGecko top 1000 (4 pages x 250) with 24h/7d/30d and sparkline. */
export async function fetchTopCoins(apiKey: string, pages = 4): Promise<RawCoin[]> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

  const out: RawCoin[] = [];
  for (let p = 1; p <= pages; p++) {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}` +
      "&price_change_percentage=24h,7d,30d&sparkline=true";

    let arr: RawCoin[] | null = null;
    for (let t = 0; t < 4; t++) {
      const res = await fetch(url, { headers });
      if (res.ok) {
        arr = (await res.json()) as RawCoin[];
        break;
      }
      if (res.status === 429) {
        await sleep(8000);
        continue;
      }
      throw new Error(`CoinGecko HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (!arr) throw new Error(`CoinGecko 429 retries exhausted on page ${p}`);
    out.push(...arr);
    if (p < pages) await sleep(2500);
  }
  return out;
}
