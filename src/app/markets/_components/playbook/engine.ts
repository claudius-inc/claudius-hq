import type {
  PlaybookEvent,
  PlaybookEventResult,
  PlaybookDataSnapshot,
  PlaybookStatus,
} from "./types";
import type { MacroIndicator } from "../types";
import type { SectorMomentum } from "@/app/api/sectors/momentum/route";

// ── Helpers available to trigger functions ──

export function findIndicator(
  snapshot: PlaybookDataSnapshot,
  id: string,
): MacroIndicator | undefined {
  return snapshot.macroIndicators.find((i) => i.id === id);
}

export function indicatorValue(
  snapshot: PlaybookDataSnapshot,
  id: string,
): number | null {
  return findIndicator(snapshot, id)?.data?.current ?? null;
}

export function findEtf(snapshot: PlaybookDataSnapshot, ticker: string) {
  return snapshot.marketEtfs.find((e) => e.ticker === ticker);
}

export function etfPrice(
  snapshot: PlaybookDataSnapshot,
  ticker: string,
): number | null {
  return findEtf(snapshot, ticker)?.data?.price ?? null;
}

export function etfChangePercent(
  snapshot: PlaybookDataSnapshot,
  ticker: string,
): number | null {
  return findEtf(snapshot, ticker)?.data?.changePercent ?? null;
}

export function etfRangePosition(
  snapshot: PlaybookDataSnapshot,
  ticker: string,
): number | null {
  return findEtf(snapshot, ticker)?.data?.rangePosition ?? null;
}

export function findSector(
  snapshot: PlaybookDataSnapshot,
  id: string,
): SectorMomentum | undefined {
  return snapshot.sectors.find((s) => s.id === id || s.ticker === id);
}

export function sectorScore(
  snapshot: PlaybookDataSnapshot,
  id: string,
): number | null {
  return findSector(snapshot, id)?.composite_score ?? null;
}

export function sectorRelStrength(
  snapshot: PlaybookDataSnapshot,
  id: string,
  period: "1w" | "1m" | "3m" = "1m",
): number | null {
  const s = findSector(snapshot, id);
  if (!s) return null;
  if (period === "1w") return s.relative_strength_1w;
  if (period === "1m") return s.relative_strength_1m;
  return s.relative_strength_3m;
}

export function spreadValue(
  snapshot: PlaybookDataSnapshot,
  name: string,
): number | null {
  return snapshot.yieldSpreads.find((s) => s.name === name)?.value ?? null;
}

// ── Core evaluation ──

export function evaluateEvent(
  event: PlaybookEvent,
  snapshot: PlaybookDataSnapshot,
): PlaybookEventResult {
  const triggerResults = event.triggers.map((t) => t.evaluate(snapshot));
  const firingCount = triggerResults.filter((r) => r.firing).length;
  const totalCount = triggerResults.length;
  const firingFraction = totalCount > 0 ? firingCount / totalCount : 0;

  const activeThreshold = event.activeThreshold ?? 0.6;
  const warmingThreshold = event.warmingThreshold ?? 0.3;

  let status: PlaybookStatus = "dormant";
  if (firingFraction >= activeThreshold) status = "active";
  else if (firingFraction >= warmingThreshold) status = "warming";

  return {
    event,
    status,
    firingCount,
    totalCount,
    firingFraction,
    triggerResults,
  };
}

export function evaluateAllEvents(
  events: PlaybookEvent[],
  snapshot: PlaybookDataSnapshot,
): PlaybookEventResult[] {
  return events
    .map((e) => evaluateEvent(e, snapshot))
    .sort((a, b) => b.firingFraction - a.firingFraction);
}
