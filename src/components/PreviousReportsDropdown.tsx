"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownItem, DropdownDivider } from "./ui/DropdownMenu";

interface Report {
  id: number;
  ticker: string;
  title: string;
  created_at: string;
}

interface PreviousReportsDropdownProps {
  reports: Report[];
  currentReportId: number;
}

export function PreviousReportsDropdown({ reports, currentReportId }: PreviousReportsDropdownProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (reports.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDelete = async (reportId: number) => {
    if (confirmDeleteId !== reportId) {
      setConfirmDeleteId(reportId);
      return;
    }

    setDeletingId(reportId);
    try {
      const response = await fetch(`/api/stocks/reports?id=${reportId}`, {
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
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const trigger = (
    <button className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Previous Reports ({reports.length})
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <DropdownMenu trigger={trigger}>
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Previous Reports
      </div>
      <DropdownDivider />
      {reports.map((report) => (
        <div key={report.id} className="group">
          <div className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
            <button
              onClick={() => router.push(`/stocks/${encodeURIComponent(report.ticker)}?report=${report.id}`)}
              className="flex-1 text-left"
            >
              <div className="text-sm font-medium text-gray-900 line-clamp-1">
                {report.title || "Sun Tzu Report"}
              </div>
              <div className="text-xs text-gray-400">
                {formatTimestamp(report.created_at)}
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(report.id);
              }}
              disabled={deletingId === report.id}
              className={`ml-2 p-1.5 rounded transition-colors ${
                confirmDeleteId === report.id
                  ? "bg-red-100 text-red-600"
                  : "text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
              }`}
              title={confirmDeleteId === report.id ? "Click again to confirm" : "Delete report"}
            >
              {deletingId === report.id ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ))}
    </DropdownMenu>
  );
}
