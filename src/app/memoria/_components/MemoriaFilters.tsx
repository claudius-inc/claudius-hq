"use client";
import { Bookmark, BookmarkCheck } from "lucide-react";
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
}

export function MemoriaFilters({
  activeSourceFilter,
  onSourceFilterChange,
  activeTagFilter,
  onTagFilterChange,
  tags,
  favouriteFilter,
  onToggleFavouriteFilter,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Source type tab bar + favourites */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {SOURCE_TYPES.map((st) => (
          <button
            key={st.label}
            onClick={() => onSourceFilterChange(st.value)}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeSourceFilter === st.value
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {st.label}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 shrink-0 mx-1" />
        <button
          onClick={onToggleFavouriteFilter}
          className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            favouriteFilter
              ? "border-yellow-500 text-yellow-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {favouriteFilter ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
          Starred
        </button>
      </div>

      {/* Tag chips */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {tags.map((tag) => {
            const isActive = activeTagFilter === tag.id;
            const count = (tag as MemoriaTag & { count?: number }).count;
            return (
              <button
                key={tag.id}
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
