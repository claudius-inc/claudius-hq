"use client";

import { useState, useEffect, useCallback } from "react";
import { PortfolioHolding, PortfolioReport } from "@/lib/types";
import { PortfolioTab } from "@/components/PortfolioTab";
import { ClarityJournal } from "@/components/ClarityJournal";

type TabId = "holdings" | "clarity";

const TABS: { id: TabId; label: string }[] = [
  { id: "holdings", label: "Holdings" },
  { id: "clarity", label: "Clarity Journal" },
];

export function PortfolioPageContent() {
  const [activeTab, setActiveTab] = useState<TabId>("holdings");
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioReports, setPortfolioReports] = useState<PortfolioReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [holdingsRes, reportsRes] = await Promise.all([
        fetch("/api/portfolio/holdings"),
        fetch("/api/portfolio/reports"),
      ]);
      const holdingsData = await holdingsRes.json();
      const reportsData = await reportsRes.json();
      setHoldings(holdingsData.holdings || []);
      setPortfolioReports(reportsData.reports || []);
    } catch (e) {
      console.error("Failed to fetch portfolio:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "holdings" && (
        <PortfolioTab
          initialHoldings={holdings}
          initialReports={portfolioReports}
        />
      )}

      {activeTab === "clarity" && <ClarityJournal />}
    </div>
  );
}
