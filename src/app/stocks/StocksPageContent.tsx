"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { StockReport, PortfolioHolding, PortfolioReport, ThemeWithPerformance } from "@/lib/types";
import { StocksTabs, StocksTab } from "@/components/StocksTabs";
import { ResearchForm } from "@/components/ResearchForm";
import { ResearchJobs } from "@/components/ResearchJobs";
import { StockFilters } from "@/components/StockFilters";
import { PortfolioTab } from "@/components/PortfolioTab";
import { ThemesTab } from "@/components/ThemesTab";
import { SectorsView } from "@/components/SectorsView";

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
    tabParam === "portfolio" || tabParam === "themes" || tabParam === "sectors" ? tabParam : "research";

  // Client-side state for portfolio and themes (fetched on demand)
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioReports, setPortfolioReports] = useState<PortfolioReport[]>([]);
  const [themes, setThemes] = useState<ThemeWithPerformance[]>([]);
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const [themesLoaded, setThemesLoaded] = useState(false);

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

  // Fetch themes data client-side when tab is active
  const fetchThemes = useCallback(async () => {
    if (themesLoaded) return;
    try {
      const res = await fetch("/api/themes");
      const data = await res.json();
      setThemes(data.themes || []);
      setThemesLoaded(true);
    } catch (e) {
      console.error("Failed to fetch themes:", e);
    }
  }, [themesLoaded]);

  // Fetch data when switching to relevant tabs
  useEffect(() => {
    if (activeTab === "portfolio") {
      fetchPortfolio();
    } else if (activeTab === "themes") {
      fetchThemes();
    }
  }, [activeTab, fetchPortfolio, fetchThemes]);

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

      {activeTab === "themes" && (
        themesLoaded ? (
          <ThemesTab initialThemes={themes} />
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )
      )}

      {activeTab === "sectors" && (
        <SectorsView />
      )}
    </>
  );
}
