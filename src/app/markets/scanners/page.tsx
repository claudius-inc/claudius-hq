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
  market?: "US" | "SGX";
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
  usCount?: number;
  sgxCount?: number;
}

interface ParsedScan {
  id: number;
  scanType: string;
  scannedAt: string | null;
  stockCount: number | null;
  results: ScanResult[];
  summary: ScanSummary | null;
}

async function getLatestScan(): Promise<ParsedScan | null> {
  try {
    // Try unified scan first
    const [unifiedScan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, "unified"))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);

    if (unifiedScan) {
      return {
        ...unifiedScan,
        results: JSON.parse(unifiedScan.results || "[]"),
        summary: unifiedScan.summary ? JSON.parse(unifiedScan.summary) : null,
      };
    }

    // Fallback: merge old scan types if no unified scan exists yet
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

    const siResults: ScanResult[] = siScan ? JSON.parse(siScan.results || "[]") : [];
    const stResults: ScanResult[] = stScan ? JSON.parse(stScan.results || "[]") : [];

    // Tag with market if not already tagged
    const taggedSi = siResults.map((r) => ({ ...r, market: (r.market || "US") as "US" | "SGX" }));
    const taggedSt = stResults.map((r) => ({ ...r, market: (r.market || "SGX") as "US" | "SGX" }));

    const merged = [...taggedSi, ...taggedSt].sort((a, b) => b.totalScore - a.totalScore);
    merged.forEach((r, idx) => (r.rank = idx + 1));

    if (merged.length === 0) return null;

    const baseScan = siScan || stScan;
    return {
      id: baseScan!.id,
      scanType: "unified",
      scannedAt: baseScan!.scannedAt,
      stockCount: merged.length,
      results: merged,
      summary: {
        universeSize: merged.length,
        scannedCount: merged.length,
        highConviction: merged.filter((r) => r.totalScore >= 70).length,
        speculative: merged.filter((r) => r.totalScore >= 50 && r.totalScore < 70).length,
        watchlist: merged.filter((r) => r.totalScore >= 35 && r.totalScore < 50).length,
        avoid: merged.filter((r) => r.totalScore < 35).length,
        usCount: taggedSi.length,
        sgxCount: taggedSt.length,
      },
    };
  } catch {
    return null;
  }
}

export default async function ScannersPage() {
  const scan = await getLatestScan();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Stock Scanners</h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated screening results updated periodically
            </p>
          </div>
        </div>
      </div>

      {/* Scanner Results */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ScannerResults scan={scan} />
      </Suspense>
    </div>
  );
}
