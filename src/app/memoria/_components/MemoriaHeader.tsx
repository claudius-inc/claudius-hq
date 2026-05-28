"use client";

import { Search, Shuffle, BookOpen, GitBranch, FileText, Brain } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SearchMode = "text" | "semantic";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onRandomClick: () => void;
  total: number;
}

export function MemoriaHeader({ searchQuery, onSearchChange, searchMode, onSearchModeChange, onRandomClick, total }: Props) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pathname = usePathname();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onSearchChange(localQuery);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [localQuery, onSearchChange]);

  const tab = pathname === "/memoria/graph" ? "graph" : pathname === "/memoria/wiki" ? "wiki" : "entries";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Memoria</h1>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>{total} entries</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        <Link
          href="/memoria"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            tab === "entries"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <BookOpen size={14} />
          Entries
        </Link>
        <Link
          href="/memoria/graph"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            tab === "graph"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <GitBranch size={14} />
          Graph
        </Link>
        <Link
          href="/memoria/wiki"
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            tab === "wiki"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <FileText size={14} />
          Wiki
        </Link>
      </div>

      {/* Search bar with mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={
              searchMode === "semantic"
                ? "Ask your knowledge graph..."
                : `Search ${total} entries...`
            }
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Mode toggle */}
        <div className="shrink-0 flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => onSearchModeChange("text")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              searchMode === "text"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            title="Text search"
          >
            Text
          </button>
          <button
            onClick={() => onSearchModeChange("semantic")}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              searchMode === "semantic"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            title="Semantic search"
          >
            <Brain size={12} />
            Semantic
          </button>
        </div>

        <button
          onClick={onRandomClick}
          className="shrink-0 p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
          title="Random entry"
        >
          <Shuffle size={14} />
        </button>
      </div>
    </div>
  );
}
