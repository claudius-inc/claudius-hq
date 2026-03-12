import type { Metadata } from "next";
import MarketsPageContent from "./MarketsPageContent";
import { detectRegime } from "./_components/helpers";
import type {
  Position,
  Summary,
  MacroIndicator,
  MarketEtf,
  RegimeData,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  YieldSpread,
} from "./_components/types";

// Revalidate every 5 minutes for ISR caching
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Markets | Claudius HQ",
  description: "Portfolio overview, research, and market signals",
};

interface PortfolioResponse {
  positions: Position[];
  summary: Summary | null;
  baseCurrency: string;
}

interface MacroResponse {
  indicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];
}

interface EtfsResponse {
  etfs: MarketEtf[];
}

interface GoldResponse {
  realYields?: { value: number };
  dxy?: { price: number };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getMarketsData() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // Fetch all data in parallel
  const [
    portfolioData,
    macroData,
    etfsData,
    sentimentData,
    breadthData,
    congressData,
    insiderData,
    goldData,
  ] = await Promise.all([
    fetchJson<PortfolioResponse>(`${baseUrl}/api/ibkr/positions`),
    fetchJson<MacroResponse>(`${baseUrl}/api/macro`),
    fetchJson<EtfsResponse>(`${baseUrl}/api/macro/etfs`),
    fetchJson<SentimentData>(`${baseUrl}/api/markets/sentiment`),
    fetchJson<BreadthData>(`${baseUrl}/api/markets/breadth`),
    fetchJson<CongressData>(`${baseUrl}/api/markets/congress`),
    fetchJson<InsiderData>(`${baseUrl}/api/markets/insider`),
    fetchJson<GoldResponse>(`${baseUrl}/api/gold`),
  ]);

  // Calculate regime data
  let regimeData: RegimeData | null = null;
  if (macroData || goldData) {
    const indicators = macroData?.indicators || [];
    const findIndicator = (id: string) => {
      const ind = indicators.find((i) => i.id === id);
      return ind?.data?.current ?? null;
    };

    const realYield = goldData?.realYields?.value ?? null;
    const debtToGdp = findIndicator("debt-to-gdp");
    const deficitToGdp = findIndicator("deficit-to-gdp");
    const dxy = goldData?.dxy?.price ?? null;

    const absDeficit = deficitToGdp ? Math.abs(deficitToGdp) : null;
    regimeData = detectRegime({ realYield, debtToGdp, deficitToGdp: absDeficit });
    regimeData.indicators.dxy = dxy;
  }

  return {
    portfolioData: portfolioData ? {
      positions: portfolioData.positions || [],
      summary: portfolioData.summary || null,
      baseCurrency: portfolioData.baseCurrency || "SGD",
    } : null,
    macroIndicators: macroData?.indicators || [],
    yieldSpreads: macroData?.yieldSpreads || [],
    marketEtfs: etfsData?.etfs || [],
    sentimentData,
    breadthData,
    congressData,
    insiderData,
    regimeData,
  };
}

export default async function StocksDashboard() {
  const data = await getMarketsData();

  return (
    <MarketsPageContent
      initialPortfolioData={data.portfolioData}
      initialMacroIndicators={data.macroIndicators}
      initialYieldSpreads={data.yieldSpreads}
      initialMarketEtfs={data.marketEtfs}
      initialSentimentData={data.sentimentData}
      initialBreadthData={data.breadthData}
      initialCongressData={data.congressData}
      initialInsiderData={data.insiderData}
      initialRegimeData={data.regimeData}
    />
  );
}
