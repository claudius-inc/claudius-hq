"use client";

import { useState } from "react";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PortfolioHolding } from "@/lib/types";
import { AllocationBar } from "../AllocationBar";

interface PortfolioSummaryProps {
  holdings: PortfolioHolding[];
  showAddForm: boolean;
  onToggleAddForm: () => void;
}

export function PortfolioSummary({
  holdings,
  showAddForm,
  onToggleAddForm,
}: PortfolioSummaryProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (holdings.length === 0) {
      setAnalyzeMessage("Add holdings first");
      return;
    }

    setAnalyzing(true);
    setAnalyzeMessage(null);

    try {
      const res = await fetch("/api/portfolio/analyze", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setAnalyzeMessage(data.error || "Failed to start analysis");
        return;
      }

      setAnalyzeMessage(
        "Analysis started! Will take 5-8 minutes. Refresh page to see results.",
      );
    } catch {
      setAnalyzeMessage("Network error");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
      <PageHero
        title="Portfolio Holdings"
        actions={[
          {
            label: analyzing ? "Starting..." : "Analyze",
            onClick: handleAnalyze,
            disabled: analyzing || holdings.length === 0,
            icon: analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />,
          },
          {
            label: "Add",
            onClick: onToggleAddForm,
            icon: <Plus className="w-3.5 h-3.5" />,
            variant: "primary" as const,
          },
        ]}
      />

      {/* Analysis Status Message */}
      {analyzeMessage && (
        <div
          className={`p-3 rounded-lg text-sm ${
            analyzeMessage.includes("started")
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {analyzeMessage}
        </div>
      )}

      {/* Allocation Bar */}
      {holdings.length > 0 && (
        <div className="card">
          <AllocationBar
            items={holdings.map((h) => ({
              ticker: h.ticker,
              allocation: h.target_allocation,
            }))}
          />
        </div>
      )}
    </>
  );
}
