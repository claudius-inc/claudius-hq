import type { Metadata } from "next";
import { Suspense } from "react";
import { db, stockScans } from "@/db";
import { desc, eq } from "drizzle-orm";
import { ScannerResults } from "@/components/scanners/ScannerResults";
import { Skeleton } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Scanners | Markets",
  description: "Stock screening results from automated scanners",
};

export const revalidate = 300; // Revalidate every 5 minutes

interface ScanResult {
  rank: number;
  ticker: string;
  name: string;
  price: number | null;
  mcapB: string;
  totalScore: number;
  tier: string;
  tierColor: string;
  riskTier: string;
  growth: { score: number; max: number; details: string[] };
  financial: { score: number; max: number; details: string[] };
  insider: { score: number; max: number; details: string[] };
  technical: { score: number; max: number; details: string[] };
  analyst: { score: number; max: number; details: string[] };
  risk: { penalty: number; flags: string[] };
  revGrowth: number | null;
  grossMargin: number | null;
}

interface ScanSummary {
  universeSize: number;
  scannedCount: number;
  highConviction: number;
  speculative: number;
  watchlist: number;
  avoid: number;
}

interface ParsedScan {
  id: number;
  scanType: string;
  scannedAt: string | null;
  stockCount: number | null;
  results: ScanResult[];
  summary: ScanSummary | null;
}

async function getLatestScans(): Promise<{
  structuralInflection: ParsedScan | null;
  sunTzuSgx: ParsedScan | null;
}> {
  try {
    const [siScan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, "structural-inflection"))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);

    const [stScan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, "sun-tzu-sgx"))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);

    const parse = (scan: typeof siScan): ParsedScan | null => {
      if (!scan) return null;
      return {
        ...scan,
        results: JSON.parse(scan.results || "[]"),
        summary: scan.summary ? JSON.parse(scan.summary) : null,
      };
    };

    return {
      structuralInflection: parse(siScan),
      sunTzuSgx: parse(stScan),
    };
  } catch {
    return { structuralInflection: null, sunTzuSgx: null };
  }
}

export default async function ScannersPage() {
  const { structuralInflection, sunTzuSgx } = await getLatestScans();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Scanners</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated screening results updated periodically
          </p>
        </div>
      </div>

      {/* Scanner Tabs */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ScannerResults
          structuralInflection={structuralInflection}
          sunTzuSgx={sunTzuSgx}
        />
      </Suspense>
    </div>
  );
}
