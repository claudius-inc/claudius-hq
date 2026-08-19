/**
 * Within-sector divergence (§5) + index-contribution (§8) — the note's product.
 * See docs/daily-note-spec.md.
 *
 * Divergence rule: a sector's direction is its SPDR ETF's 1d%. When a sector is
 * DOWN we surface constituents that closed GREEN (relative strength); when it's
 * UP we surface those that closed RED (relative weakness). Ranked by distance
 * from the sector move, capped per sector, and shown only where the divergence
 * is meaningful — quiet sectors are dropped rather than padded.
 *
 * Index-contribution: Σ(float weight × 1d%) over the constituents, gated on
 * reconciling with the actual index move (§8) — the claim is OMITTED, never
 * approximated, when the weights can't reproduce the tape.
 */
import { db, sp500Constituents } from "@/db";
import { logger } from "@/lib/logger";
import { fetchBatchQuotes, type QuoteResult } from "@/lib/scanner/yahoo-fetcher";
import { etDate, toMs } from "@/lib/notes/session";
import { toYahooSymbol } from "@/lib/notes/sources/daily-bars";
import type { DivergenceSector, DivergenceName, ContributionData, SectorPoint } from "@/lib/notes/types";

const SRC = "notes/divergence";

/** Max names surfaced per sector (§5.5). */
const MAX_PER_SECTOR = 3;
/** A sector must have moved at least this much for its divergence to matter (§5.6). */
const SECTOR_MOVE_THRESHOLD = 1.0;
/**
 * A diverging name must itself have moved at least this much. Gating on the gap
 * alone is useless — a contrarian is by definition opposite-signed to a sector
 * that already moved ≥1.0, so every candidate's gap already exceeds 1.0. Without
 * this, a name at +0.01% in a −1.2% sector ranks as a top "tell" and renders as
 * the self-contradicting "ABC +0.0% closed green in a red sector".
 */
const MIN_NAME_MOVE = 0.25;
/** Σ(w·r) must land within this of the index move or the claim is dropped (§8). */
const RECONCILE_TOLERANCE_PP = 0.1;

interface ConstituentQuote {
  ticker: string;
  name: string | null;
  sectorEtf: string;
  spyWeight: number | null;
  changePct: number;
  /** Extended-session move, when the §G gate passes. Rides the same batch call. */
  postMarket: { changePct: number; asOfMs: number } | null;
  // Relevance inputs (§A). All ride the same batch call — no extra requests.
  sectorWeight: number | null;
  price: number | null;
  volume: number | null;
  avgVolume10d: number | null;
  /** Yahoo's session-half placeholder, classified by earnings-window.ts. */
  earningsStamp: unknown;
}

/**
 * An extended-session move must clear this to be worth printing (§G). There is
 * no post-market volume field, so a thin name's print can be a single odd lot;
 * this threshold and the always-stated "as of" clock are the only mitigation.
 */
const POST_MARKET_MIN_PCT = 2.0;

/**
 * The §G gate. Returns null unless the quote carries a real extended-session
 * print, later than that symbol's own regular close, that clears the threshold.
 *
 * The boundary is the symbol's OWN `regularMarketTime`, never a hardcoded 16:00:
 * on a half-day the close is 1pm, and a 16:00 test would reject every legitimate
 * print. Indices report `hasPrePostMarketData: false` and are excluded here.
 */
function extractPostMarket(
  q: QuoteResult | undefined,
  marketDate: string,
): { changePct: number; asOfMs: number } | null {
  if (!q?.hasPrePostMarketData) return null;
  const pct = q.postMarketChangePercent;
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < POST_MARKET_MIN_PCT) return null;
  const postMs = toMs(q.postMarketTime);
  const regMs = toMs(q.regularMarketTime);
  // Number.isFinite first: Date.parse of a bad string is NaN, and every
  // comparison against NaN is false, so it would flow through as asOfMs and
  // make the ET formatter throw — outside this module's try/catch.
  if (!Number.isFinite(postMs) || !Number.isFinite(regMs)) return null;
  if (postMs <= 0 || regMs <= 0 || postMs <= regMs) return null;
  // The print must be from TODAY's session. `postMs > regMs` alone also holds
  // when BOTH are from a prior day — a name halted all session serves stale
  // quotes, and a halt pending news is exactly when a large stale after-hours
  // move exists. The session gate only checks the index, so it cannot catch a
  // per-symbol stale quote.
  if (etDate(postMs) !== marketDate) return null;
  return { changePct: Math.round(pct * 100) / 100, asOfMs: postMs };
}

/** Warn past this age; the dataset drifts at each quarterly rebalance. */
const STALE_WARN_DAYS = 45;
/** Past this age, refuse to use it at all (§1a: omit rather than assert). */
const STALE_REJECT_DAYS = 120;

/** Fetch 1d% for every stored constituent (one batched pass, ~26 requests). */
async function loadConstituentQuotes(marketDate: string): Promise<ConstituentQuote[]> {
  const rows = await db.select().from(sp500Constituents);
  if (rows.length === 0) {
    logger.warn(SRC, "No constituents stored — run scripts/seed/sp500-constituents.ts");
    return [];
  }

  // The dataset is seeded out-of-band, so it can silently age past a rebalance.
  // A removed-but-still-trading name would otherwise be surfaced as an "S&P
  // constituent" tell, and stale weights can reconcile by luck on a quiet day.
  const newest = rows.reduce<number>((max, r) => {
    const t = r.updatedAt ? Date.parse(r.updatedAt.replace(" ", "T") + (r.updatedAt.endsWith("Z") ? "" : "Z")) : NaN;
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  const ageDays = newest > 0 ? (Date.now() - newest) / 86_400_000 : Infinity;
  if (ageDays > STALE_REJECT_DAYS) {
    logger.error(SRC, "Constituent dataset too stale — omitting divergence/contribution", {
      ageDays: Math.round(ageDays),
    });
    return [];
  }
  if (ageDays > STALE_WARN_DAYS) {
    logger.warn(SRC, "Constituent dataset is aging — reseed soon", { ageDays: Math.round(ageDays) });
  }

  // Yahoo uses '-' where SPDR uses '.' for share classes (BRK.B → BRK-B).
  const quotes = await fetchBatchQuotes(rows.map((r) => toYahooSymbol(r.ticker)));

  const out: ConstituentQuote[] = [];
  for (const r of rows) {
    const q = quotes.get(toYahooSymbol(r.ticker));
    const pct = q?.regularMarketChangePercent;
    if (pct == null || !Number.isFinite(pct)) continue;
    out.push({
      ticker: r.ticker,
      name: r.name,
      sectorEtf: r.sectorEtf,
      spyWeight: r.spyWeight,
      changePct: Math.round(pct * 100) / 100,
      postMarket: extractPostMarket(q, marketDate),
      sectorWeight: r.sectorWeight ?? null,
      price: q?.regularMarketPrice ?? null,
      volume: q?.regularMarketVolume ?? null,
      avgVolume10d: q?.averageDailyVolume10Day ?? null,
      earningsStamp: q?.earningsTimestamp,
    });
  }
  logger.info(SRC, "Constituent quotes loaded", { stored: rows.length, quoted: out.length });
  return out;
}

/**
 * Compute the §5 divergence set. `sectors` supplies each sector ETF's own 1d%
 * (the benchmark); constituents without a matching sector move are skipped.
 */
export function computeDivergence(
  quotes: ConstituentQuote[],
  sectors: SectorPoint[],
): DivergenceSector[] {
  const sectorByEtf = new Map(sectors.map((s) => [s.etf, s]));
  const grouped = new Map<string, ConstituentQuote[]>();
  for (const q of quotes) {
    const list = grouped.get(q.sectorEtf);
    if (list) list.push(q);
    else grouped.set(q.sectorEtf, [q]);
  }

  const out: DivergenceSector[] = [];
  for (const [etf, members] of Array.from(grouped.entries())) {
    const sector = sectorByEtf.get(etf);
    if (!sector) continue;
    // Only a sector that actually moved can have a meaningful counter-move.
    if (Math.abs(sector.changePct) < SECTOR_MOVE_THRESHOLD) continue;

    const sectorDown = sector.changePct < 0;
    // Sector down → the green names; sector up → the red ones.
    const contrarians = members.filter((m) =>
      sectorDown ? m.changePct > 0 : m.changePct < 0,
    );

    const ranked: DivergenceName[] = contrarians
      .map((m) => ({
        ticker: m.ticker,
        name: m.name,
        changePct: m.changePct,
        gap: Math.round((m.changePct - sector.changePct) * 100) / 100,
      }))
      .filter((m) => Math.abs(m.changePct) >= MIN_NAME_MOVE)
      // Ranked purely by distance from the sector move. The spec's "× liquidity"
      // term is deliberately dropped: pure-gap ranking surfaces the most
      // anomalous mover, which is the tell, rather than the biggest name.
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, MAX_PER_SECTOR);

    if (ranked.length === 0) continue;
    out.push({
      etf,
      sectorName: sector.name,
      sectorChangePct: sector.changePct,
      direction: sectorDown ? "down" : "up",
      names: ranked,
    });
  }

  // Sharpest sector divergence first.
  out.sort((a, b) => Math.abs(b.sectorChangePct) - Math.abs(a.sectorChangePct));
  return out;
}

/**
 * Σ(float weight × 1d%) vs the actual index move (§8). Returns null — the claim
 * is omitted — when weights are missing or the reconciliation gate fails.
 */
export function computeContribution(
  quotes: ConstituentQuote[],
  indexChangePct: number,
): ContributionData | null {
  const weighted = quotes.filter((q) => q.spyWeight != null && Number.isFinite(q.spyWeight));
  const totalWeight = weighted.reduce((s, q) => s + (q.spyWeight as number), 0);
  // Weights are percents; require near-full index coverage before trusting them.
  if (weighted.length < 400 || totalWeight < 90) {
    logger.warn(SRC, "Contribution omitted — insufficient weight coverage", {
      names: weighted.length,
      totalWeight: Math.round(totalWeight),
    });
    return null;
  }

  const contrib = weighted.map((q) => ({
    ticker: q.ticker,
    changePct: q.changePct,
    // weight is a percent, change is a percent → contribution in index %-points.
    points: ((q.spyWeight as number) / 100) * q.changePct,
  }));
  const modelled = contrib.reduce((s, c) => s + c.points, 0);

  if (Math.abs(modelled - indexChangePct) > RECONCILE_TOLERANCE_PP) {
    logger.warn(SRC, "Contribution omitted — reconciliation gate failed", {
      modelled: Math.round(modelled * 1000) / 1000,
      actual: indexChangePct,
    });
    return null;
  }

  // How many top contributors are holding up (or dragging) the whole index:
  // strip the top-N movers and see where the index lands. Both the pick and the
  // flip test use `modelled` so they can't disagree in sign on a ~0% day.
  const sorted = [...contrib].sort((a, b) => b.points - a.points);
  const topN = modelled >= 0 ? sorted.slice(0, 5) : sorted.slice(-5).reverse();
  const topPoints = topN.reduce((s, c) => s + c.points, 0);
  const exTop = modelled - topPoints;

  return {
    modelledPct: Math.round(modelled * 100) / 100,
    actualPct: indexChangePct,
    topNames: topN.map((c) => c.ticker),
    topContributors: topN.map((c) => ({
      ticker: c.ticker,
      changePct: Math.round(c.changePct * 100) / 100,
      points: Math.round(c.points * 100) / 100,
    })),
    topPoints: Math.round(topPoints * 100) / 100,
    exTopPct: Math.round(exTop * 100) / 100,
    // True when the index's sign flips once the top names are removed. Requires
    // a non-trivial index move so Math.sign(0) can't make this spuriously true.
    flipsWithoutTop:
      Math.abs(modelled) >= 0.05 && Math.abs(exTop) > 0.01 && Math.sign(exTop) !== Math.sign(modelled),
  };
}

export interface DivergenceResult {
  divergence: DivergenceSector[];
  contribution: ContributionData | null;
  quotedCount: number;
  /** Constituent moves grouped by sector ETF — feeds spotlight leaders/laggards (§6). */
  moversBySector: Map<string, { ticker: string; changePct: number }[]>;
  /** Ticker → extended-session move, for names the note already prints (§G). */
  postMarketByTicker: Map<string, { changePct: number; asOfMs: number }>;
  /** Raw per-constituent rows, so §A can score without a second fetch. */
  constituents: ConstituentQuote[];
}

export type { ConstituentQuote };

const EMPTY: DivergenceResult = {
  divergence: [],
  contribution: null,
  quotedCount: 0,
  moversBySector: new Map(),
  postMarketByTicker: new Map(),
  constituents: [],
};

/** Load quotes once and derive every constituent-derived fact. */
export async function computeDivergenceFacts(
  sectors: SectorPoint[] | null,
  indexChangePct: number | null,
  marketDate: string,
): Promise<DivergenceResult> {
  try {
    const quotes = await loadConstituentQuotes(marketDate);
    if (quotes.length === 0) return EMPTY;

    const moversBySector = new Map<string, { ticker: string; changePct: number }[]>();
    const postMarketByTicker = new Map<string, { changePct: number; asOfMs: number }>();
    for (const q of quotes) {
      const entry = { ticker: q.ticker, changePct: q.changePct };
      const list = moversBySector.get(q.sectorEtf);
      if (list) list.push(entry);
      else moversBySector.set(q.sectorEtf, [entry]);
      if (q.postMarket) postMarketByTicker.set(q.ticker, q.postMarket);
    }

    return {
      divergence: sectors ? computeDivergence(quotes, sectors) : [],
      contribution: indexChangePct != null ? computeContribution(quotes, indexChangePct) : null,
      quotedCount: quotes.length,
      moversBySector,
      postMarketByTicker,
      constituents: quotes,
    };
  } catch (error) {
    logger.error(SRC, "Divergence computation failed", { error });
    return EMPTY;
  }
}
