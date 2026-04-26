"use client";

import { useRef, useEffect } from "react";
import { Loader2, ArrowUpDown } from "lucide-react";
import type { MemoriaEntry } from "../page";
import { EntryCard } from "./EntryCard";

export type SortOption = "recent" | "oldest" | "recently_starred" | "longest";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "recently_starred", label: "Recently Starred" },
  { value: "longest", label: "Longest" },
];

interface Props {
  entries: MemoriaEntry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleFavorite: (entry: MemoriaEntry) => void;
  togglingFavoriteId: number | null;
  onEntryClick: (entry: MemoriaEntry) => void;
  total: number;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function MemoriaGrid({ entries, loading, loadingMore, hasMore, onLoadMore, onToggleFavorite, togglingFavoriteId, onEntryClick, total, sort, onSortChange }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, onLoadMore]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400" size={20} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-sm text-gray-500">No entries found</div>
        <div className="text-xs text-gray-400 mt-1">
          Add your first quote, highlight, or idea
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Context line */}
      <div className="flex items-center justify-between py-2 mb-2">
        <span className="text-xs text-gray-400">{total} entries</span>
        <div className="relative flex items-center gap-1.5">
          <ArrowUpDown size={12} className="text-gray-400" />
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="text-xs text-gray-500 bg-transparent border-none focus:outline-none cursor-pointer appearance-none pr-1"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onToggleFavorite={onToggleFavorite}
            togglingFavoriteId={togglingFavoriteId}
            onClick={onEntryClick}
          />
        ))}
      </div>
      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="animate-spin text-gray-400" size={18} />
        </div>
      )}
      {!hasMore && entries.length > 0 && (
        <div className="text-center text-xs text-gray-300 py-4">No more entries</div>
      )}
    </div>
  );
}
