"use client";

import { useState, useRef, useEffect } from "react";
import { Bookmark, BookmarkCheck, BookOpen, ChevronDown, X } from "lucide-react";
import type { MemoriaTag } from "../page";

const SOURCE_TYPES = [
  { value: null, label: "All" },
  { value: "book", label: "Book" },
  { value: "article", label: "Article" },
  { value: "podcast", label: "Podcast" },
  { value: "conversation", label: "Conversation" },
  { value: "thought", label: "Thought" },
  { value: "tweet", label: "Tweet" },
  { value: "video", label: "Video" },
] as const;

interface Props {
  activeSourceFilter: string | null;
  onSourceFilterChange: (source: string | null) => void;
  activeTagFilter: number | null;
  onTagFilterChange: (tagId: number | null) => void;
  tags: MemoriaTag[];
  favouriteFilter: boolean;
  onToggleFavouriteFilter: () => void;
  titleFilter: string | null;
  onClearTitleFilter: () => void;
  authorFilter: string | null;
  onClearAuthorFilter: () => void;
}

function SourceTypeDropdown({
  activeSourceFilter,
  onSourceFilterChange,
}: {
  activeSourceFilter: string | null;
  onSourceFilterChange: (source: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeLabel =
    SOURCE_TYPES.find((st) => st.value === activeSourceFilter)?.label ?? "All";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
          activeSourceFilter
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        {activeLabel}
        <ChevronDown size={10} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
          {SOURCE_TYPES.map((st) => (
            <button
              key={st.label}
              type="button"
              onClick={() => {
                onSourceFilterChange(st.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                activeSourceFilter === st.value
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MemoriaFilters({
  activeSourceFilter,
  onSourceFilterChange,
  activeTagFilter,
  onTagFilterChange,
  tags,
  favouriteFilter,
  onToggleFavouriteFilter,
  titleFilter,
  onClearTitleFilter,
  authorFilter,
  onClearAuthorFilter,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Row 1: Starred, source type dropdown, author/title filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={onToggleFavouriteFilter}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
            favouriteFilter
              ? "bg-yellow-50 text-yellow-700 border-yellow-300"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {favouriteFilter ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
          Starred
        </button>

        <SourceTypeDropdown
          activeSourceFilter={activeSourceFilter}
          onSourceFilterChange={onSourceFilterChange}
        />

        {titleFilter && (
          <button
            type="button"
            onClick={onClearTitleFilter}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-blue-300 bg-blue-50 text-blue-700"
          >
            <BookOpen size={10} />
            <span className="truncate max-w-[150px]">{titleFilter}</span>
            <X size={10} />
          </button>
        )}
        {authorFilter && (
          <button
            type="button"
            onClick={onClearAuthorFilter}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-purple-300 bg-purple-50 text-purple-700"
          >
            <span className="truncate max-w-[150px]">{authorFilter}</span>
            <X size={10} />
          </button>
        )}
      </div>

      {/* Row 2: Tag pills */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {tags.map((tag) => {
            const isActive = activeTagFilter === tag.id;
            const count = (tag as MemoriaTag & { count?: number }).count;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onTagFilterChange(isActive ? null : tag.id)}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {tag.name}{count != null ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
