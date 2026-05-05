import Link from "next/link";
import { marked } from "marked";
import { AlertTriangle } from "lucide-react";
import type { StockReport } from "@/lib/types";
import { ReportTOC } from "@/app/markets/research/[ticker]/_components/ReportTOC";
import { ReportActions } from "@/app/markets/research/[ticker]/_components/ReportActions";
import { ReadingProgressBar } from "@/app/markets/research/[ticker]/_components/ReadingProgressBar";
import { GenerateReportButton } from "@/app/markets/research/[ticker]/_components/GenerateReportButton";

interface OlderReport {
  id: number;
  ticker: string;
  slug: string | null;
  title: string;
  created_at: string;
}

interface TickerResearchProps {
  ticker: string;
  companyName: string | null;
  current: StockReport | null;
  older: OlderReport[];
}

function addHeadingIds(html: string): string {
  return html.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level, text) => {
    const id = String(text)
      .replace(/<[^>]*>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

function stripRedundantHeaders(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/^(\s*<h1[^>]*>.*?<\/h1>\s*)/i, "");
  cleaned = cleaned.replace(/^(\s*<h2[^>]*>.*?Sun Tzu.*?<\/h2>\s*)/i, "");
  cleaned = cleaned.replace(/^(\s*<hr[^>]*\/?>\s*)+/i, "");
  return cleaned;
}

function formatTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) return "—";
  const utc = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
  return new Date(utc).toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });
}

function formatShortDate(timestamp: string | null | undefined) {
  if (!timestamp) return "—";
  const utc = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
  return new Date(utc).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Singapore",
  });
}

function staleness(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const utc = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
  const diff = Date.now() - new Date(utc).getTime();
  const days = Math.floor(diff / 86400000);
  return days > 90 ? days : null;
}

export async function TickerResearch({
  ticker,
  companyName,
  current,
  older,
}: TickerResearchProps) {
  if (!current) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Research
        </h2>
        <div className="text-3xl mb-2">📊</div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          No reports for {ticker}
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Want a deep-dive investment analysis?
        </p>
        <GenerateReportButton ticker={ticker} />
      </div>
    );
  }

  const rawHtml = await marked(current.content);
  const htmlContent = stripRedundantHeaders(addHeadingIds(rawHtml));
  const stale = staleness(current.created_at);

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3 border-b border-gray-100 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Research
          </h2>
          {stale && (
            <span
              className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
              title="This report may be outdated"
            >
              <AlertTriangle className="w-3 h-3" /> {stale}d old
            </span>
          )}
          <span className="text-xs text-gray-400 hidden sm:inline">
            {formatTimestamp(current.created_at)}
          </span>
          <span className="text-xs text-gray-400 sm:hidden">
            {formatShortDate(current.created_at)}
          </span>
        </div>
        <ReportActions
          olderReports={older.map((o) => ({
            id: o.id,
            ticker: o.ticker,
            title: o.title,
            created_at: o.created_at,
          }))}
          currentReportId={current.id}
          ticker={current.ticker}
          content={current.content}
          companyName={current.company_name || companyName || undefined}
        />
      </div>

      <div className="flex lg:gap-4">
        <ReportTOC content={current.content} />
        <div className="flex-1 min-w-0">
          <div className="px-5 py-5">
            <div
              className="prose prose-sm md:prose-base prose-gray max-w-none prose-headings:text-gray-900 prose-headings:scroll-mt-32 md:prose-headings:scroll-mt-36 prose-h2:text-base prose-h2:md:text-lg prose-h2:font-semibold prose-h3:text-sm prose-h3:md:text-base prose-h3:font-medium prose-p:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600 prose-table:text-xs prose-table:md:text-sm [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>

          {older.length > 0 && (
            <div className="px-5 pb-5">
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Previous reports
              </h3>
              <ul className="space-y-1">
                {older.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/markets/ticker/${r.slug || r.ticker}?report=${r.id}`}
                      className="text-sm text-gray-600 hover:text-emerald-600 transition-colors inline-flex items-center gap-2"
                    >
                      <span className="text-gray-400">•</span>
                      Report from {formatShortDate(r.created_at)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0">
        <ReadingProgressBar />
      </div>
    </div>
  );
}
