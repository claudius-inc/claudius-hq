"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Star, Shuffle, Loader2 } from "lucide-react";
import type { MemoriaEntry } from "../page";

interface Props {
  open: boolean;
  onClose: () => void;
  onToggleFavorite: (entry: MemoriaEntry) => void;
  togglingFavoriteId: number | null;
}

export function RandomModal({ open, onClose, onToggleFavorite, togglingFavoriteId }: Props) {
  const [entry, setEntry] = useState<MemoriaEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRandom = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memoria/random");
      const data = await res.json();
      setEntry(data.entry || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchRandom();
  }, [open, fetchRandom]);

  return (
    <Modal open={open} onClose={onClose} title="Random Entry">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      ) : !entry ? (
        <div className="text-center py-10 text-sm text-gray-400">
          No entries yet. Add some first!
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="capitalize">{entry.sourceType}</span>
            {entry.sourceTitle && (
              <>
                <span className="text-gray-300">·</span>
                <span>{entry.sourceTitle}</span>
              </>
            )}
          </div>
          <div className="text-sm text-gray-800 leading-relaxed">{entry.content}</div>
          {entry.sourceAuthor && (
            <div className="text-xs text-gray-400">— {entry.sourceAuthor}</div>
          )}
          {entry.myNote && (
            <div className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
              {entry.myNote}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onToggleFavorite(entry)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              {togglingFavoriteId === entry.id ? (
                <Loader2 size={12} className="animate-spin text-yellow-400" />
              ) : (
                <Star
                  size={12}
                  className={entry.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}
                />
              )}
              {togglingFavoriteId === entry.id ? "Saving..." : entry.isFavorite ? "Favorited" : "Favorite"}
            </button>
            <button
              onClick={fetchRandom}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <Shuffle size={12} />
              Next Random
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
