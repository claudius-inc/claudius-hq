"use client";

import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { MemoriaEntry } from "../page";
import { EntryCard } from "./EntryCard";

interface Props {
  entries: MemoriaEntry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleFavorite: (entry: MemoriaEntry) => void;
  onEntryClick: (entry: MemoriaEntry) => void;
}

export function MemoriaGrid({ entries, loading, loadingMore, hasMore, onLoadMore, onToggleFavorite, onEntryClick }: Props) {
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
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onToggleFavorite={onToggleFavorite}
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
