"use client";

import type { MemoriaEntry } from "../page";
import { EntryCard } from "./EntryCard";

interface Props {
  entries: MemoriaEntry[];
  loading: boolean;
  onToggleFavorite: (entry: MemoriaEntry) => void;
  onEntryClick: (entry: MemoriaEntry) => void;
}

export function MemoriaGrid({ entries, loading, onToggleFavorite, onEntryClick }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">📚</div>
        <div className="text-sm text-gray-500">No entries yet</div>
        <div className="text-xs text-gray-400 mt-1">
          Add your first quote, highlight, or idea
        </div>
      </div>
    );
  }

  return (
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
  );
}
