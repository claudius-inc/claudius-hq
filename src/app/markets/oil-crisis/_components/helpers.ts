import { OIL_CONSTANTS, CRISIS_START_DATE, getShutInForDay, type ScenarioParams, type PricePoint } from "./constants";

/**
 * Calculate current day of crisis
 */
export function getCrisisDay(): number {
  const now = new Date();
  const diffTime = now.getTime() - CRISIS_START_DATE.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

/**
 * Calculate estimated Brent price based on supply disruption
 * 
 * Formula:
 * basePrice = 75 // Pre-crisis Brent
 * supplyLoss% = shutInMbd / 103 * 100
 * priceMultiplier = 1 + (supplyLoss% * 0.07) // 7% price increase per 1% supply loss
 * reserveOffset = sprRelease / shutInMbd * 0.3 // Reserves dampen ~30%
 * estimatedPrice = basePrice * priceMultiplier * (1 - reserveOffset)
 */
export function calculatePrice(shutInMbd: number, sprRelease: number = 0): number {
  const { BASE_BRENT_PRICE, GLOBAL_DEMAND_MBD, PRICE_ELASTICITY_FACTOR, RESERVE_DAMPEN_FACTOR } = OIL_CONSTANTS;
  
  if (shutInMbd <= 0) return BASE_BRENT_PRICE;
  
  const supplyLossPercent = (shutInMbd / GLOBAL_DEMAND_MBD) * 100;
  const priceMultiplier = 1 + (supplyLossPercent * PRICE_ELASTICITY_FACTOR);
  const reserveOffset = shutInMbd > 0 ? (sprRelease / shutInMbd) * RESERVE_DAMPEN_FACTOR : 0;
  const estimatedPrice = BASE_BRENT_PRICE * priceMultiplier * (1 - Math.min(reserveOffset, 0.5));
  
  return Math.round(estimatedPrice * 100) / 100;
}

/**
 * Calculate current crisis metrics
 */
export function getCurrentMetrics() {
  const day = getCrisisDay();
  const shutInMbd = getShutInForDay(day);
  const supplyLossPercent = (shutInMbd / OIL_CONSTANTS.GLOBAL_DEMAND_MBD) * 100;
  
  // After day 5, SPR release starts
  const sprRelease = day >= 5 ? 2.0 : 0;
  const brentPrice = calculatePrice(shutInMbd, sprRelease);
  const priceChange = brentPrice - OIL_CONSTANTS.BASE_BRENT_PRICE;
  
  return {
    crisisDays: day,
    shutInMbd: Math.round(shutInMbd * 10) / 10,
    supplyOfflinePercent: Math.round(supplyLossPercent * 10) / 10,
    brentPrice: Math.round(brentPrice * 100) / 100,
    priceChange: Math.round(priceChange * 100) / 100,
    priceChangePercent: Math.round((priceChange / OIL_CONSTANTS.BASE_BRENT_PRICE) * 100),
    sprRelease,
  };
}

/**
 * Simulate price trajectory for scenario
 */
export function simulateScenario(params: ScenarioParams): PricePoint[] {
  const { shutInMbd, sprRelease, duration, reopeningDay } = params;
  const points: PricePoint[] = [];
  
  for (let day = 1; day <= duration; day++) {
    let effectiveShutIn = shutInMbd;
    let event: string | undefined;
    
    // If reopening is scheduled, reduce shut-in after that day
    if (reopeningDay && day >= reopeningDay) {
      const daysAfterReopen = day - reopeningDay;
      // Gradual recovery: 3 mbd per day
      effectiveShutIn = Math.max(0, shutInMbd - daysAfterReopen * 3);
      if (day === reopeningDay) {
        event = "Strait reopens";
      }
    }
    
    // Calculate supply and demand
    const supply = OIL_CONSTANTS.GLOBAL_DEMAND_MBD - effectiveShutIn + sprRelease;
    const price = calculatePrice(effectiveShutIn, sprRelease);
    
    // Demand destruction kicks in at high prices
    let demand = OIL_CONSTANTS.GLOBAL_DEMAND_MBD;
    if (price > OIL_CONSTANTS.DEMAND_DESTRUCTION_PRICE) {
      // ~0.5% demand drop per $10 above threshold
      const priceOverThreshold = price - OIL_CONSTANTS.DEMAND_DESTRUCTION_PRICE;
      const demandDrop = (priceOverThreshold / 10) * 0.005 * demand;
      demand -= demandDrop;
    }
    
    const deficit = supply - demand;
    
    // Add events for key days
    if (day === 1) event = event || "Crisis begins";
    if (day === 5) event = event || "SPR release";
    if (day === 7) event = event || "OPEC+ response";
    if (day === 15) event = event || "Demand destruction";
    
    points.push({
      day,
      price: Math.round(price * 100) / 100,
      supply: Math.round(supply * 10) / 10,
      demand: Math.round(demand * 10) / 10,
      deficit: Math.round(deficit * 10) / 10,
      event,
    });
  }
  
  return points;
}

/**
 * Calculate key derived metrics
 */
export function calculateKeyMetrics(shutInMbd: number, sprRelease: number, duration: number) {
  // SPR coverage days
  const sprDrawdownDaily = sprRelease; // mbd
  const totalSprBarrels = OIL_CONSTANTS.GLOBAL_SPR_BARRELS_M;
  const sprCoverageDays = sprDrawdownDaily > 0 
    ? Math.floor(totalSprBarrels / sprDrawdownDaily) 
    : Infinity;
  
  // Peak price estimate
  const peakPrice = calculatePrice(shutInMbd, 0); // No SPR damping for peak
  
  // US SPR coverage
  const usSprCoverageDays = sprRelease > 0 
    ? Math.floor(OIL_CONSTANTS.US_SPR_BARRELS_M / (sprRelease * 0.5)) // US contributes ~50%
    : Infinity;
  
  // Gasoline price estimate (rough: $30 + price/3)
  const currentPrice = calculatePrice(shutInMbd, sprRelease);
  const gasolinePrice = 3.0 + (currentPrice - 75) / 25; // ~$0.04/gallon per $1 oil
  
  return {
    sprCoverageDays: Math.min(sprCoverageDays, 999),
    peakPriceEstimate: Math.round(peakPrice),
    demandDestructionPrice: OIL_CONSTANTS.DEMAND_DESTRUCTION_PRICE,
    usSprCoverageDays: Math.min(usSprCoverageDays, 999),
    gasolinePrice: Math.round(gasolinePrice * 100) / 100,
  };
}

/**
 * Format date from crisis day
 */
export function formatCrisisDate(day: number): string {
  const date = new Date(CRISIS_START_DATE);
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Determine crisis status
 */
export function getCrisisStatus(day: number): "active" | "escalating" | "de-escalating" | "resolved" {
  if (day <= 7) return "escalating";
  if (day <= 21) return "active";
  return "active"; // For now, until resolution logic is added
}
