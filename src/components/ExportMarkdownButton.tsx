"use client";

import { Download } from "lucide-react";

interface ExportMarkdownButtonProps {
  ticker: string;
  content: string;
  companyName?: string;
}

export function ExportMarkdownButton({ ticker, content, companyName }: ExportMarkdownButtonProps) {
  const handleExport = () => {
    const filename = `${ticker}${companyName ? `-${companyName.replace(/[^a-zA-Z0-9]/g, "-")}` : ""}-research.md`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
      title="Export as Markdown"
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">.md</span>
    </button>
  );
}
