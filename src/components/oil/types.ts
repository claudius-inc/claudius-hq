export interface OilQuote {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAvg: number | null;
  twoHundredDayAvg: number | null;
}

export interface OilKeyLevel {
  level: number;
  significance: string;
}

export interface OilContextData {
  geopolitical: string[];
  supply: string[];
  seasonal: string;
}

export interface OilData {
  wti: OilQuote | null;
  brent: OilQuote | null;
  spread: number | null;
  keyLevels: OilKeyLevel[];
  context: OilContextData;
  updatedAt: string;
  cached?: boolean;
  cacheAge?: string;
  isStale?: boolean;
}
