"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { StockReport, WatchlistItem, PortfolioHolding, PortfolioReport } from "@/lib/types";
import { StocksTabs, StocksTab } from "@/components/StocksTabs";
import { ResearchForm } from "@/components/ResearchForm";
import { ResearchJobs } from "@/components/ResearchJobs";
import { StockFilters } from "@/components/StockFilters";
import { WatchlistTab } from "@/components/WatchlistTab";
import { PortfolioTab } from "@/components/PortfolioTab";
import { PortfolioInclusionModal } from "@/components/PortfolioInclusionModal";

type ResearchJob = {
  id: string;
  ticker: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  error_message: string | null;
  report_id: number | null;
  created_at: string;
  updated_at: string;
};

interface StocksPageContentProps {
  reports: StockReport[];
  activeJobs: ResearchJob[];
}

export function StocksPageContent({
  reports,
  activeJobs,
}: StocksPageContentProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: StocksTab =
    tabParam === "watchlist" || tabParam === "portfolio" ? tabParam : "research";

  // State for portfolio inclusion modal
  const [promotingItem, setPromotingItem] = useState<WatchlistItem | null>(null);
  
  // Client-side state for watchlist and portfolio (fetched on demand)
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioReports, setPortfolioReports] = useState<PortfolioReport[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);

  // Fetch watchlist data client-side when tab is active
  const fetchWatchlist = useCallback(async () => {
    if (watchlistLoaded) return;
    try {
      const res = await fetch("/api/watchlist");
      const data = await res.json();
      setWatchlistItems(data.items || []);
      setWatchlistLoaded(true);
    } catch (e) {
      console.error("Failed to fetch watchlist:", e);
    }
  }, [watchlistLoaded]);

  // Fetch portfolio data client-side when tab is active
  const fetchPortfolio = useCallback(async () => {
    if (portfolioLoaded) return;
    try {
      const [holdingsRes, reportsRes] = await Promise.all([
        fetch("/api/portfolio/holdings"),
        fetch("/api/portfolio/reports"),
      ]);
      const holdingsData = await holdingsRes.json();
      const reportsData = await reportsRes.json();
      setHoldings(holdingsData.holdings || []);
      setPortfolioReports(reportsData.reports || []);
      setPortfolioLoaded(true);
    } catch (e) {
      console.error("Failed to fetch portfolio:", e);
    }
  }, [portfolioLoaded]);

  // Fetch data when switching to relevant tabs
  useEffect(() => {
    if (activeTab === "watchlist") {
      fetchWatchlist();
      // Also fetch portfolio for the promotion modal
      fetchPortfolio();
    } else if (activeTab === "portfolio") {
      fetchPortfolio();
    }
  }, [activeTab, fetchWatchlist, fetchPortfolio]);

  const handlePromoteToPortfolio = (item: WatchlistItem) => {
    setPromotingItem(item);
  };

  const handleAddToPortfolio = async (newHolding: {
    ticker: string;
    target_allocation: number;
    cost_basis: number | null;
    shares: number | null;
  }) => {
    const res = await fetch("/api/portfolio/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newHolding),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to add");
    }

    const data = await res.json();
    setHoldings([...holdings, data.holding].sort(
      (a, b) => b.target_allocation - a.target_allocation
    ));
  };

  return (
    <>
      {/* Tabs */}
      <StocksTabs activeTab={activeTab} />

      {/* Tab Content */}
      {activeTab === "research" && (
        <>
          {/* Research Form */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              New Research
            </h2>
            <div className="card">
              <ResearchForm />
            </div>
          </div>

          {/* In Progress Jobs */}
          <ResearchJobs initialJobs={activeJobs} />

          {/* Filtered Reports */}
          {reports.length > 0 ? (
            <StockFilters reports={reports} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">📈</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                No reports yet
              </h3>
              <p className="text-sm text-gray-500">
                Enter a ticker above to queue research, or add reports via the API
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === "watchlist" && (
        watchlistLoaded ? (
          <WatchlistTab
            initialItems={watchlistItems}
            onPromoteToPortfolio={handlePromoteToPortfolio}
          />
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )
      )}

      {activeTab === "portfolio" && (
        portfolioLoaded ? (
          <PortfolioTab
            initialHoldings={holdings}
            initialReports={portfolioReports}
          />
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )
      )}

      {/* Portfolio Inclusion Modal */}
      {promotingItem && (
        <PortfolioInclusionModal
          item={promotingItem}
          existingHoldings={holdings}
          onClose={() => setPromotingItem(null)}
          onSubmit={handleAddToPortfolio}
        />
      )}
    </>
  );
}
