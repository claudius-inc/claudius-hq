// ── Thesis Asset Registry ────────────────────────────────────────────
// Maps asset names to their thesis config + resolver factory.
// Gold is implemented; others are stubs for future expansion.

import type { ThesisAssetConfig } from "./types";
import type { SignalDataResolver } from "./engine";
import { GOLD_THESIS_CONFIG, GoldSignalDataResolver } from "./gold";

export interface ThesisRegistryEntry {
  config: ThesisAssetConfig;
  createResolver: () => SignalDataResolver;
}

const registry: Record<string, ThesisRegistryEntry | null> = {
  gold: {
    config: GOLD_THESIS_CONFIG,
    createResolver: () => new GoldSignalDataResolver(),
  },
  oil: null,
  btc: null,
  silver: null,
};

export function getThesisEntry(asset: string): ThesisRegistryEntry | null {
  return registry[asset] ?? null;
}

export function getSupportedAssets(): string[] {
  return Object.keys(registry).filter((k) => registry[k] !== null);
}
