import type {
  MacroIndicator,
  SentimentData,
  BreadthData,
  MarketEtf,
  CongressData,
  InsiderData,
  YieldSpread,
  RegimeData,
} from "../types";
import type { SectorMomentum } from "@/app/api/sectors/momentum/route";

// ── Hard asset snapshots (from SWR) ──

export interface BtcSnapshot {
  livePrice: number;
  changePercent: number;
  distancePercent: number;
  wma200: number;
  mayerMultiple: number;
  sma200d: number;
}

export interface GoldSnapshot {
  livePrice: number | null;
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number } | null;
  gld: { price: number; changePercent: number } | null;
  analysis: { ath: number | null; athDate: string | null } | null;
}

export interface OilSnapshot {
  wti: { price: number | null; changePercent: number | null } | null;
  brent: { price: number | null; changePercent: number | null } | null;
  spread: number | null;
}

// ── Data snapshot consumed by the playbook engine ──

export interface PlaybookDataSnapshot {
  // Macro indicators (keyed by id for easy lookup)
  macroIndicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];

  // Sentiment & breadth
  sentiment: SentimentData | null;
  breadth: BreadthData | null;

  // ETFs (TLT, ITA, etc.)
  marketEtfs: MarketEtf[];

  // Smart money
  congress: CongressData | null;
  insider: InsiderData | null;

  // Hard assets (from SWR)
  btc: BtcSnapshot | null;
  gold: GoldSnapshot | null;
  oil: OilSnapshot | null;

  // Sector momentum (from SWR)
  sectors: SectorMomentum[];

  // Regime
  regime: RegimeData | null;
}

// ── Trigger & Event types ──

export interface TriggerResult {
  id: string;
  label: string;
  firing: boolean;
  value: string;
  detail: string;
}

export interface TriggerCondition {
  id: string;
  label: string;
  evaluate: (snapshot: PlaybookDataSnapshot) => TriggerResult;
}

export type PlaybookCategory =
  | "economic-cycle"
  | "monetary"
  | "geopolitical"
  | "financial-system"
  | "market-structure"
  | "structural";

export type PlaybookStatus = "active" | "warming" | "dormant";

export interface PlaybookEvent {
  id: string;
  name: string;
  category: PlaybookCategory;
  description: string;
  historicalContext: string;
  implications: string[];
  triggers: TriggerCondition[];
  activeThreshold?: number;   // fraction ≥ this = active   (default 0.6)
  warmingThreshold?: number;  // fraction ≥ this = warming  (default 0.3)
}

export interface PlaybookEventResult {
  event: PlaybookEvent;
  status: PlaybookStatus;
  firingCount: number;
  totalCount: number;
  firingFraction: number;
  triggerResults: TriggerResult[];
}
