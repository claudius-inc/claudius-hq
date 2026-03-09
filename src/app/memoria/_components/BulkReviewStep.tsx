"use client";

import { useState } from "react";

interface ParsedEntry {
  content: string;
  sourceType: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  aiTags?: string[];
  aiSummary?: string;
}

interface Props {
  entries: ParsedEntry[];
  saving: boolean;
  onSave: (entries: ParsedEntry[]) => void;
  onBack: () => void;
}

export function BulkReviewStep({ entries, saving, onSave, onBack }: Props) {
  const [selected, setSelected] = useState<boolean[]>(entries.map(() => true));

  const toggle = (i: number) => {
    setSelected((prev) => prev.map((s, idx) => (idx === i ? !s : s)));
  };

  const selectedEntries = entries.filter((_, i) => selected[i]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        {selectedEntries.length} of {entries.length} entries selected
      </div>
      <div className="max-h-[400px] overflow-y-auto space-y-2">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`flex gap-2 p-3 rounded-lg border ${
              selected[i] ? "border-blue-200 bg-blue-50/50" : "border-gray-100 bg-gray-50 opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={selected[i]}
              onChange={() => toggle(i)}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 line-clamp-3">{entry.content}</div>
              {entry.aiTags && entry.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.aiTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          Back
        </button>
        <button
          onClick={() => onSave(selectedEntries)}
          disabled={selectedEntries.length === 0 || saving}
          className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : `Save ${selectedEntries.length} Entries`}
        </button>
      </div>
    </div>
  );
}
