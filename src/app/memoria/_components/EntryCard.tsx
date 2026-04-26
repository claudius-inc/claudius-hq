"use client";

import { useState } from "react";
import { Star, BookOpen, FileText, Headphones, MessageCircle, Lightbulb, Twitter, Video, Loader2 } from "lucide-react";
import type { MemoriaEntry } from "../page";
import { TagBadge } from "./TagBadge";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  book: <BookOpen size={14} />,
  article: <FileText size={14} />,
  podcast: <Headphones size={14} />,
  conversation: <MessageCircle size={14} />,
  thought: <Lightbulb size={14} />,
  tweet: <Twitter size={14} />,
  video: <Video size={14} />,
};

interface Props {
  entry: MemoriaEntry;
  onToggleFavorite: (entry: MemoriaEntry) => void;
  togglingFavoriteId: number | null;
  onClick: (entry: MemoriaEntry) => void;
}

export function EntryCard({ entry, onToggleFavorite, togglingFavoriteId, onClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length > 200;

  return (
    <div
      className="break-inside-avoid bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(entry)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {SOURCE_ICONS[entry.sourceType] || <FileText size={14} />}
          <span className="capitalize">{entry.sourceType}</span>
          {entry.sourceTitle && (
            <>
              <span className="text-gray-300">·</span>
              <span className="truncate max-w-[150px]">{entry.sourceTitle}</span>
            </>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(entry);
          }}
          className="p-1 hover:bg-gray-100 rounded"
        >
          {togglingFavoriteId === entry.id ? (
            <Loader2 size={14} className="animate-spin text-yellow-400" />
          ) : (
            <Star
              size={14}
              className={entry.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
            />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="text-sm text-gray-800 leading-relaxed">
        {isLong && !expanded ? (
          <>
            {entry.content.slice(0, 200)}...
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="text-blue-500 text-xs ml-1"
            >
              more
            </button>
          </>
        ) : (
          entry.content
        )}
      </div>

      {/* Author */}
      {entry.sourceAuthor && (
        <div className="text-xs text-gray-400 mt-2">— {entry.sourceAuthor}</div>
      )}

      {/* Note */}
      {entry.myNote && (
        <div className="text-xs text-gray-500 mt-2 italic border-l-2 border-gray-200 pl-2">
          {entry.myNote}
        </div>
      )}

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      )}
    </div>
  );
}
