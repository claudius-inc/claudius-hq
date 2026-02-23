"use client";

import { useState, useEffect, useRef } from "react";
import { PreviousReportsDropdown } from "./PreviousReportsDropdown";
import { ExportMarkdownButton } from "./ExportMarkdownButton";
import Link from "next/link";

interface Report {
  id: number;
  ticker: string;
  title: string;
  created_at: string;
}

interface ReportActionsProps {
  olderReports: Report[];
  currentReportId: number;
  ticker: string;
  content: string;
  companyName?: string;
}

export function ReportActions({ olderReports, currentReportId, ticker, content, companyName }: ReportActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = () => {
    const filename = `${ticker}${companyName ? `-${companyName.replace(/[^a-zA-Z0-9]/g, "-")}` : ""}-research.md`;
    const header = `# ${companyName ? `${companyName} (${ticker})` : ticker}\n\n`;
    const fullContent = header + content;
    const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <>
      {/* Desktop: inline actions */}
      <div className="hidden lg:flex items-center gap-2">
        {olderReports.length > 0 && (
          <PreviousReportsDropdown reports={olderReports} currentReportId={currentReportId} />
        )}
        <ExportMarkdownButton ticker={ticker} content={content} companyName={companyName} />
        <Link
          href={`/markets/research?refresh=${encodeURIComponent(ticker)}`}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          title="Generate new research report"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </Link>
      </div>

      {/* Mobile: three-dots menu */}
      <div className="lg:hidden relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Actions"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-10 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
            {olderReports.length > 0 && (
              <>
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Previous Reports</p>
                {olderReports.slice(0, 5).map((r) => {
                  const utcTs = r.created_at.endsWith("Z") ? r.created_at : r.created_at + "Z";
                  const date = new Date(utcTs);
                  const label = date.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Singapore" });
                  return (
                    <Link
                      key={r.id}
                      href={`/markets/research/${r.ticker}?report=${r.id}`}
                      className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setOpen(false)}
                    >
                      Report from {label}
                    </Link>
                  );
                })}
                <div className="border-t border-gray-100 my-1" />
              </>
            )}
            <button
              onClick={handleExport}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Markdown
            </button>
            <Link
              href={`/markets/research?refresh=${encodeURIComponent(ticker)}`}
              className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Research
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
