// Oil Crisis Simulator Constants

export const CRISIS_START_DATE = new Date("2026-02-28");

export const OIL_CONSTANTS = {
  // Pre-crisis baseline
  GLOBAL_DEMAND_MBD: 103.0,
  ME_PRODUCTION_MBD: 20.5,
  BASE_BRENT_PRICE: 75, // Pre-crisis Brent

  // Strait of Hormuz specifics
  STRAIT_FLOW_MBD: 18.0,
  STRAIT_PERCENT_GLOBAL: 17.5,

  // Response capacity
  US_SPR_BARRELS_M: 395, // million barrels
  GLOBAL_SPR_BARRELS_M: 1500,
  OPEC_SPARE_CAPACITY_MBD: 5.0,

  // Price model
  PRICE_ELASTICITY_FACTOR: 0.07, // 7% price increase per 1% supply loss
  RESERVE_DAMPEN_FACTOR: 0.3, // Reserves dampen ~30%

  // Demand destruction threshold
  DEMAND_DESTRUCTION_PRICE: 175,
};

// Shut-in escalation pattern (mbd by day)
export const SHUTIN_ESCALATION: Record<number, number> = {
  1: 5.0,
  2: 8.0,
  3: 10.0,
  4: 12.0,
  5: 14.0,
  7: 15.5,
  10: 16.5,
  14: 17.5,
  17: 18.2,
  21: 18.5,
  30: 18.5,
  60: 18.5,
  90: 18.5,
};

// Get shut-in for a specific day (interpolates)
export function getShutInForDay(day: number): number {
  const days = Object.keys(SHUTIN_ESCALATION)
    .map(Number)
    .sort((a, b) => a - b);

  if (day <= days[0]) return SHUTIN_ESCALATION[days[0]];
  if (day >= days[days.length - 1])
    return SHUTIN_ESCALATION[days[days.length - 1]];

  for (let i = 0; i < days.length - 1; i++) {
    if (day >= days[i] && day < days[i + 1]) {
      const ratio = (day - days[i]) / (days[i + 1] - days[i]);
      return (
        SHUTIN_ESCALATION[days[i]] +
        ratio * (SHUTIN_ESCALATION[days[i + 1]] - SHUTIN_ESCALATION[days[i]])
      );
    }
  }

  return SHUTIN_ESCALATION[days[days.length - 1]];
}

// Supply/Demand balance rows (based on research)
export interface SupplyRow {
  id: string;
  source: string;
  preCrisis: number;
  getCurrent: (day: number) => number;
  unit: "mbd";
  breakdown?: { country: string; preCrisis: number; current: number }[];
}

export const SUPPLY_ROWS: SupplyRow[] = [
  {
    id: "me_production",
    source: "Middle East Production",
    preCrisis: 20.5,
    getCurrent: (day) => Math.max(20.5 - getShutInForDay(day), 0.5),
    unit: "mbd",
    breakdown: [
      { country: "Saudi Arabia", preCrisis: 9.0, current: 0.5 },
      { country: "UAE", preCrisis: 3.2, current: 0.2 },
      { country: "Iraq", preCrisis: 4.5, current: 0.8 },
      { country: "Kuwait", preCrisis: 2.7, current: 0.3 },
      { country: "Iran", preCrisis: 1.1, current: 0.5 },
    ],
  },
  {
    id: "spr_releases",
    source: "SPR Releases (Global)",
    preCrisis: 0,
    getCurrent: (day) => (day >= 5 ? 2.0 : 0),
    unit: "mbd",
    breakdown: [
      { country: "USA", preCrisis: 0, current: 1.0 },
      { country: "IEA Members", preCrisis: 0, current: 0.6 },
      { country: "China", preCrisis: 0, current: 0.4 },
    ],
  },
  {
    id: "opec_spare",
    source: "OPEC+ Spare Capacity",
    preCrisis: 0,
    getCurrent: (day) => (day >= 7 ? 3.5 : day >= 3 ? 1.5 : 0),
    unit: "mbd",
  },
  {
    id: "non_opec",
    source: "Non-OPEC Response",
    preCrisis: 0,
    getCurrent: (day) => (day >= 14 ? 0.8 : day >= 7 ? 0.3 : 0),
    unit: "mbd",
  },
  {
    id: "demand_destruction",
    source: "Demand Destruction",
    preCrisis: 0,
    getCurrent: (day) => (day >= 15 ? -1.2 : day >= 10 ? -0.5 : 0),
    unit: "mbd",
  },
];

// Timeline events for price forecasts
export interface TimelineEvent {
  day: number;
  event: string;
  brentLow: number;
  brentMid: number;
  brentHigh: number;
}

export const CRISIS_TIMELINE: TimelineEvent[] = [
  { day: 1, event: "Strait closure announced", brentLow: 85, brentMid: 92, brentHigh: 98 },
  { day: 3, event: "IEA emergency meeting", brentLow: 100, brentMid: 108, brentHigh: 118 },
  { day: 5, event: "Coordinated SPR release (2mbd)", brentLow: 110, brentMid: 118, brentHigh: 130 },
  { day: 7, event: "OPEC+ activates spare capacity", brentLow: 120, brentMid: 128, brentHigh: 140 },
  { day: 10, event: "Supply stabilizes", brentLow: 135, brentMid: 145, brentHigh: 160 },
  { day: 15, event: "Demand destruction begins", brentLow: 148, brentMid: 162, brentHigh: 180 },
  { day: 17, event: "Current day", brentLow: 150, brentMid: 165, brentHigh: 185 },
  { day: 20, event: "Plateau expected", brentLow: 155, brentMid: 172, brentHigh: 195 },
  { day: 30, event: "New equilibrium", brentLow: 158, brentMid: 175, brentHigh: 200 },
];

// Types for Scenario Simulator
export interface ScenarioParams {
  shutInMbd: number;
  sprRelease: number;
  duration: number;
  reopeningDay: number | null;
}

export const DEFAULT_SCENARIO: ScenarioParams = {
  shutInMbd: 10,
  sprRelease: 2,
  duration: 30,
  reopeningDay: null,
};

export interface PricePoint {
  day: number;
  price: number;
  supply: number;
  demand: number;
  deficit: number;
  event?: string;
}

// Crisis status
export type CrisisStatus = "active" | "escalating" | "de-escalating" | "resolved";
