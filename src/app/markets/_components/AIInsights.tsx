import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/Skeleton";
import { ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { InsightsData } from "./types";

interface AIInsightsProps {
  insightsData: InsightsData | null;
  generating: boolean;
  insightsError: string | null;
  loadingInsights: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  regenerateInsights: () => void;
}

export function AIInsights({
  insightsData,
  generating,
  insightsError,
  loadingInsights,
  expandedIds,
  toggleExpanded,
  regenerateInsights,
}: AIInsightsProps) {
  return (
    <div className="col-span-full">
      <div className="card overflow-hidden !p-0 border-l-4 border-blue-500">
        <button
          onClick={() => toggleExpanded("ai-insights")}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${expandedIds.has("ai-insights") ? "rotate-90" : ""}`} />
          <h3 className="text-sm font-semibold text-gray-900 flex-1">
            AI Market Insights
          </h3>
          {generating && (
            <span className="text-[10px] text-blue-600 animate-pulse shrink-0">Generating...</span>
          )}
          {insightsData?.generatedAt && (
            <span className="text-[10px] text-gray-400 shrink-0">
              {formatDate(insightsData.generatedAt)}
            </span>
          )}
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); regenerateInsights(); }}
            className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            Regenerate
          </span>
        </button>
        {expandedIds.has("ai-insights") && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {insightsError && (
              <div className="bg-red-50 text-red-700 text-xs p-2 rounded mt-3 mb-2">
                {insightsError === "GEMINI_API_KEY not configured"
                  ? "Add GEMINI_API_KEY to enable AI insights"
                  : insightsError}
              </div>
            )}
            {generating ? (
              <div className="flex items-center gap-2 text-gray-500 py-3 text-xs">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing macro indicators...
              </div>
            ) : loadingInsights ? (
              <div className="space-y-1.5 animate-pulse mt-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : insightsData?.insights ? (
              <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1 prose-ul:my-1 prose-li:my-0.5 text-xs mt-3">
                <ReactMarkdown>{insightsData.insights}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-gray-500 text-xs py-3">
                No insights yet. Click &quot;Regenerate&quot; to analyze current conditions.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
