"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PortfolioHolding, PortfolioReport } from "@/lib/types";
import { InvestorCritiques, parseCritiquesFromMarkdown } from "../InvestorCritiques";
import { formatDateTime } from "@/lib/date";
import { marked } from "marked";

interface AnalysisReportProps {
  report: PortfolioReport;
  holdings: PortfolioHolding[];
}

export function AnalysisReport({ report, holdings }: AnalysisReportProps) {
  const [reportExpanded, setReportExpanded] = useState(false);

  return (
    <>
      {/* Investor Critiques */}
      <InvestorCritiques critiques={parseCritiquesFromMarkdown(report.content)} />

      {/* Latest Report */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Latest Analysis</h2>
        <div className="card">
          <div className="mb-4 p-4 bg-emerald-50 rounded-lg">
            <div className="text-sm text-emerald-800">
              <p className="font-medium mb-2">
                Generated: {formatDateTime(report.created_at)}
              </p>
              <p>
                <span className="font-medium">Portfolio: </span>
                {holdings.map((h) => `${h.ticker} (${h.target_allocation}%)`).join(", ")}
              </p>
            </div>
          </div>
          
          {/* Expand/Collapse Button */}
          <button
            onClick={() => setReportExpanded(!reportExpanded)}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
          >
            {reportExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Collapse Report
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                View Full Report
              </>
            )}
          </button>
          
          {/* Expandable Report Content */}
          {reportExpanded && (
            <div
              className="mt-4 pt-4 border-t border-gray-100 prose prose-sm max-w-none prose-table:text-xs [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap [&_th]:px-2 [&_td]:px-2"
              dangerouslySetInnerHTML={{
                __html: marked(report.content) as string,
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
