"use client";

import { useState, useEffect, useCallback } from "react";
import { PortfolioHolding, PortfolioReport } from "@/lib/types";
import { PortfolioTab } from "@/components/PortfolioTab";
import { PortfolioSkeleton } from "@/components/Skeleton";

export function PortfolioPageContent() {
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
    return <PortfolioSkeleton />;
  }

  return (
    <PortfolioTab
      initialHoldings={holdings}
      initialReports={portfolioReports}
    />
  );
}
