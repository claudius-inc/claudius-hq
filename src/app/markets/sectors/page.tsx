import type { Metadata } from "next";
import { SectorsView } from "@/components/SectorsView";
import { MarketData, BenchmarkData } from "@/components/global-markets";
import { SectorData, MarketBenchmark } from "@/components/sectors";

// Revalidate every 5 minutes for ISR caching
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sectors | Stocks",
};

interface MarketsResponse {
  markets: MarketData[];
  benchmark: BenchmarkData;
  updated_at: string;
  error?: string;
}

interface SectorsResponse {
  sectors: SectorData[];
  market: MarketBenchmark;
  updated_at: string;
  error?: string;
}

async function getMarketsData(): Promise<{ 
  markets: MarketData[]; 
  benchmark: BenchmarkData | null;
  sectors: SectorData[];
  sectorBenchmark: MarketBenchmark | null;
  updatedAt: string | null;
}> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";
    
    const [marketsRes, sectorsRes] = await Promise.all([
      fetch(`${baseUrl}/api/markets/momentum`, { next: { revalidate: 300 } }),
      fetch(`${baseUrl}/api/sectors/momentum`, { next: { revalidate: 300 } }),
    ]);
    
    const [marketsData, sectorsData] = await Promise.all([
      marketsRes.ok ? marketsRes.json() as Promise<MarketsResponse> : null,
      sectorsRes.ok ? sectorsRes.json() as Promise<SectorsResponse> : null,
    ]);

    return {
      markets: marketsData?.markets || [],
      benchmark: marketsData?.benchmark || null,
      sectors: sectorsData?.sectors || [],
      sectorBenchmark: sectorsData?.market || null,
      updatedAt: marketsData?.updated_at || sectorsData?.updated_at || null,
    };
  } catch (e) {
    console.error("Failed to fetch markets data:", e);
    return {
      markets: [],
      benchmark: null,
      sectors: [],
      sectorBenchmark: null,
      updatedAt: null,
    };
  }
}

export default async function SectorsPage() {
  const { markets, benchmark, sectors, sectorBenchmark, updatedAt } = await getMarketsData();
  
  return (
    <SectorsView 
      initialMarkets={markets}
      initialBenchmark={benchmark}
      initialSectors={sectors}
      initialSectorBenchmark={sectorBenchmark}
      initialUpdatedAt={updatedAt}
    />
  );
}
