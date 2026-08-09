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
import { fetchBatchQuotes } from "@/lib/scanner/yahoo-fetcher";
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
}

/** Warn past this age; the dataset drifts at each quarterly rebalance. */
const STALE_WARN_DAYS = 45;
/** Past this age, refuse to use it at all (§1a: omit rather than assert). */
const STALE_REJECT_DAYS = 120;

/** Fetch 1d% for every stored constituent (one batched pass, ~26 requests). */
async function loadConstituentQuotes(): Promise<ConstituentQuote[]> {
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
  const toYahoo = (t: string) => t.replace(/\./g, "-");
  const quotes = await fetchBatchQuotes(rows.map((r) => toYahoo(r.ticker)));

  const out: ConstituentQuote[] = [];
  for (const r of rows) {
    const q = quotes.get(toYahoo(r.ticker));
    const pct = q?.regularMarketChangePercent;
    if (pct == null || !Number.isFinite(pct)) continue;
    out.push({
      ticker: r.ticker,
      name: r.name,
      sectorEtf: r.sectorEtf,
      spyWeight: r.spyWeight,
      changePct: Math.round(pct * 100) / 100,
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
}

const EMPTY: DivergenceResult = {
  divergence: [],
  contribution: null,
  quotedCount: 0,
  moversBySector: new Map(),
};

/** Load quotes once and derive every constituent-derived fact. */
export async function computeDivergenceFacts(
  sectors: SectorPoint[] | null,
  indexChangePct: number | null,
): Promise<DivergenceResult> {
  try {
    const quotes = await loadConstituentQuotes();
    if (quotes.length === 0) return EMPTY;

    const moversBySector = new Map<string, { ticker: string; changePct: number }[]>();
    for (const q of quotes) {
      const entry = { ticker: q.ticker, changePct: q.changePct };
      const list = moversBySector.get(q.sectorEtf);
      if (list) list.push(entry);
      else moversBySector.set(q.sectorEtf, [entry]);
    }

    return {
      divergence: sectors ? computeDivergence(quotes, sectors) : [],
      contribution: indexChangePct != null ? computeContribution(quotes, indexChangePct) : null,
      quotedCount: quotes.length,
      moversBySector,
    };
  } catch (error) {
    logger.error(SRC, "Divergence computation failed", { error });
    return EMPTY;
  }
}
