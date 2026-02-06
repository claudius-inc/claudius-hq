import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { ResearchForm } from "@/components/ResearchForm";
import { StockFilters } from "@/components/StockFilters";

export const dynamic = "force-dynamic";

async function getReports(): Promise<StockReport[]> {
  try {
    const result = await db.execute("SELECT * FROM stock_reports ORDER BY created_at DESC");
    return result.rows as unknown as StockReport[];
  } catch {
    return [];
  }
}

export default async function StocksPage() {
  await ensureDB();
  const reports = await getReports();

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Research</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sun Tzu analysis and weekly scans
            </p>
          </div>
        </div>

        {/* Research Form */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            New Research
          </h2>
          <div className="card">
            <ResearchForm />
          </div>
        </div>

        {/* Filtered Reports */}
        {reports.length > 0 ? (
          <StockFilters reports={reports} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📈</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No reports yet</h3>
            <p className="text-sm text-gray-500">
              Enter a ticker above to queue research, or add reports via the API
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
