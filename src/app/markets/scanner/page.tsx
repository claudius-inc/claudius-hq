import type { Metadata } from "next";
import { Suspense } from "react";
import { db, stockScans } from "@/db";
import { desc, eq } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { ScannerResults } from "./_components/ScannerResults";
import { UniverseManager } from "./_components/UniverseManager";
import { RefreshButton } from "./_components/RefreshButton";
import { MethodologyModal } from "./_components/MethodologyModal";
import { ScanAge } from "./_components/ScanAge";
import { Skeleton } from "@/components/Skeleton";
import type { ScanResult, ParsedScan } from "./types";

export const metadata: Metadata = {
  title: "Scanner | Markets",
  description: "Stock screening results from automated scanners",
};

export const revalidate = 300; // Revalidate every 5 minutes

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

    const siResults: ScanResult[] = siScan
      ? JSON.parse(siScan.results || "[]")
      : [];
    const stResults: ScanResult[] = stScan
      ? JSON.parse(stScan.results || "[]")
      : [];

    // Tag with market if not already tagged
    const taggedSi = siResults.map((r) => ({
      ...r,
      market: (r.market || "US") as "US" | "SGX" | "HK" | "JP",
    }));
    const taggedSt = stResults.map((r) => ({
      ...r,
      market: (r.market || "SGX") as "US" | "SGX" | "HK" | "JP",
    }));

    const merged = [...taggedSi, ...taggedSt].sort(
      (a, b) => b.totalScore - a.totalScore,
    );
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
        speculative: merged.filter(
          (r) => r.totalScore >= 50 && r.totalScore < 70,
        ).length,
        watchlist: merged.filter((r) => r.totalScore >= 35 && r.totalScore < 50)
          .length,
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
    <>
      <PageHero
        title="Stock Scanner"
        subtitle="Pre-computed screening results"
        badge={<MethodologyModal />}
        actionSlot={
          <div className="flex flex-col items-end gap-1">
            <RefreshButton />
            {scan?.scannedAt && <ScanAge date={scan.scannedAt} />}
          </div>
        }
      />

      {/* Scanner Results */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ScannerResults scan={scan} />
      </Suspense>

      {/* Universe Manager */}
      <div className="mt-8">
        <UniverseManager />
      </div>
    </>
  );
}
