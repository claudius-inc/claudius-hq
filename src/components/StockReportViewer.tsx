"use client";

import { StockReport } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./ui/Spinner";

function renderMarkdown(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" class="text-emerald-600 hover:underline">$1</a>')
    // Line breaks — double newline = paragraph
    .replace(/\n\n/g, '</p><p class="text-sm text-gray-700 mb-2">')
    // Wrap consecutive list items
    .replace(
      /(<li[^>]*>.*?<\/li>\n?)+/g,
      (match) => `<ul class="mb-3 space-y-1">${match}</ul>`
    );

  // Wrap in paragraph
  html = `<p class="text-sm text-gray-700 mb-2">${html}</p>`;

  return html;
}

export function StockReportViewer({ report }: { report: StockReport }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const date = new Date(report.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/stocks/reports?id=${report.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.refresh();
      } else {
        console.error("Failed to delete report");
      }
    } catch (error) {
      console.error("Error deleting report:", error);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Truncate content for preview
  const previewLength = 500;
  const needsTruncation = report.content.length > previewLength;
  const previewContent = needsTruncation && !expanded
    ? report.content.slice(0, previewLength) + "..."
    : report.content;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 group relative ${isDeleting ? "opacity-50" : ""}`}>
      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className={`absolute top-3 right-3 p-1.5 rounded transition-all ${
          confirmDelete
            ? "bg-red-100 text-red-600"
            : "text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
        }`}
        title={confirmDelete ? "Click again to confirm" : "Delete report"}
      >
        {isDeleting ? (
          <Spinner size="sm" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>

      <div className="flex items-start justify-between mb-3 pr-8">
        <div>
          <Link 
            href={`/stocks/${report.id}`}
            className="font-semibold text-gray-900 hover:text-emerald-600 transition-colors"
          >
            {report.title || `Sun Tzu Report: ${report.ticker}`}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">{dateStr}</span>
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 uppercase">
              {report.report_type}
            </span>
          </div>
        </div>
        <Link
          href={`/stocks/${report.id}`}
          className="font-mono text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          {report.ticker}
        </Link>
      </div>
      <div
        className="prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(previewContent) }}
      />
      {needsTruncation && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
          <Link
            href={`/stocks/${report.id}`}
            className="text-sm text-emerald-600 hover:text-emerald-700"
          >
            View full report →
          </Link>
        </div>
      )}
    </div>
  );
}
