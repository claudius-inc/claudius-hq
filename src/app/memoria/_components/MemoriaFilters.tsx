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
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1 flex-wrap">
        {SOURCE_TYPES.map((st) => (
          <button
            key={st.label}
            onClick={() => onSourceFilterChange(st.value)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              activeSourceFilter === st.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>
      {tags.length > 0 && (
        <select
          value={activeTagFilter ?? ""}
          onChange={(e) => onTagFilterChange(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={onToggleFavouriteFilter}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
          favouriteFilter
            ? "bg-yellow-50 text-yellow-700 border-yellow-300"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        {favouriteFilter ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
        Favourites
      </button>
    </div>
  );
}
