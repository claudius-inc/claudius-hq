"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MemoriaHeader, SearchMode } from "./_components/MemoriaHeader";
import { MemoriaFilters } from "./_components/MemoriaFilters";
import { MemoriaGrid, SortOption } from "./_components/MemoriaGrid";
import { RandomModal } from "./_components/RandomModal";
import { EntryDetailModal } from "./_components/EntryDetailModal";
import { InsightsPanel } from "./_components/InsightsPanel";
import { QAPanel } from "./_components/QAPanel";

export interface MemoriaEntry {
  id: number;
  content: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceUrl: string | null;
  sourceLocation: string | null;
  myNote: string | null;
  aiTags: string | null;
  aiSummary: string | null;
  isFavorite: number | null;
  isArchived: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  capturedAt: string | null;
  lastSurfacedAt: string | null;
  tags: { id: number; name: string; color: string | null }[];
}

export interface MemoriaTag {
  id: number;
  name: string;
  color: string | null;
  createdAt: string | null;
  count?: number;
}

const BATCH_SIZE = 20;

export default function MemoriaPage() {
  const [entries, setEntries] = useState<MemoriaEntry[]>([]);
  const [tags, setTags] = useState<MemoriaTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const [activeSourceFilter, setActiveSourceFilter] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const [semanticResults, setSemanticResults] = useState<Array<{ id: string; content: string; category: string; importance: number; entities: string[]; tags: string[] }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [favouriteFilter, setFavouriteFilter] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("recent");
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<number | null>(null);
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MemoriaEntry | null>(null);

  // Read favourite filter from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("favourite") === "true") {
      setFavouriteFilter(true);
    }
  }, []);

  const fetchEntries = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      pageRef.current = 1;
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      if (searchQuery && searchMode === "semantic") {
        const res = await fetch("/api/memoria/search/semantic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: 30 }),
        });
        const data = await res.json();
        setSemanticResults(data.results || []);
        setEntries([]);
        setHasMore(false);
        return;
      }

      if (searchQuery) {
        const res = await fetch(`/api/memoria/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setEntries(data.entries || []);
        setSemanticResults([]);
        setHasMore(false);
        return;
      }

      setSemanticResults([]);

      const params = new URLSearchParams();
      if (activeSourceFilter) params.set("source_type", activeSourceFilter);
      if (activeTagFilter) params.set("tag", String(activeTagFilter));
      if (favouriteFilter) params.set("favorite", "1");
      if (titleFilter) params.set("source_title", titleFilter);
      if (authorFilter) params.set("source_author", authorFilter);
      params.set("sort", sort);
      params.set("per_page", String(BATCH_SIZE));
      params.set("page", String(pageRef.current));

      const res = await fetch(`/api/memoria?${params.toString()}`);
      const data = await res.json();
      const newEntries = data.entries || [];
      totalRef.current = data.total ?? 0;

      if (reset) {
        setEntries(newEntries);
      } else {
        setEntries((prev) => [...prev, ...newEntries]);
      }

      const fetchedSoFar = reset ? newEntries.length : entries.length + newEntries.length;
      setHasMore(fetchedSoFar < totalRef.current);
    } catch {
      if (reset) setEntries([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeSourceFilter, activeTagFilter, searchQuery, favouriteFilter, titleFilter, authorFilter, sort, entries.length, searchMode]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchEntries(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceFilter, activeTagFilter, searchQuery, favouriteFilter, titleFilter, authorFilter, sort, searchMode]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/memoria/tags");
      const data = await res.json();
      setTags(data.tags || []);
    } catch {
      setTags([]);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    pageRef.current += 1;
    fetchEntries(false);
  }, [loadingMore, hasMore, loading, fetchEntries]);

  const handleToggleFavouriteFilter = useCallback(() => {
    setFavouriteFilter((prev) => {
      const next = !prev;
      const url = new URL(window.location.href);
      if (next) {
        url.searchParams.set("favourite", "true");
      } else {
        url.searchParams.delete("favourite");
      }
      window.history.replaceState({}, "", url.toString());
      return next;
    });
  }, []);

  const handleFilterByTitle = useCallback((title: string) => {
    setTitleFilter((prev) => prev === title ? null : title);
  }, []);

  const handleFilterByAuthor = useCallback((author: string) => {
    setAuthorFilter((prev) => prev === author ? null : author);
  }, []);

  const handleToggleFavorite = async (entry: MemoriaEntry) => {
    setTogglingFavoriteId(entry.id);
    try {
      await fetch(`/api/memoria/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: entry.isFavorite ? 0 : 1 }),
      });
      // If favourite filter is active and we un-favourited, remove from list
      if (favouriteFilter && entry.isFavorite) {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      } else {
        // Toggle in-place
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, isFavorite: e.isFavorite ? 0 : 1 } : e))
        );
      }
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/memoria/${id}`, { method: "DELETE" });
    setSelectedEntry(null);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-4">
      <MemoriaHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        onRandomClick={() => setShowRandomModal(true)}
        total={totalRef.current}
      />
      <MemoriaFilters
        activeSourceFilter={activeSourceFilter}
        onSourceFilterChange={setActiveSourceFilter}
        activeTagFilter={activeTagFilter}
        onTagFilterChange={setActiveTagFilter}
        tags={tags}
        favouriteFilter={favouriteFilter}
        onToggleFavouriteFilter={handleToggleFavouriteFilter}
        titleFilter={titleFilter}
        onClearTitleFilter={() => setTitleFilter(null)}
        authorFilter={authorFilter}
        onClearAuthorFilter={() => setAuthorFilter(null)}
      />
      <InsightsPanel />
      <QAPanel onCitationClick={(entryId) => {
        const entry = entries.find((e) => e.id === entryId);
        if (entry) setSelectedEntry(entry);
      }} />
      {/* Semantic search results */}
      {searchMode === "semantic" && semanticResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Knowledge Graph Results
          </div>
          <div className="grid grid-cols-1 gap-2">
            {semanticResults.map((result) => (
              <div
                key={result.id}
                className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-relaxed">{result.content}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                        {result.category}
                      </span>
                      {result.importance >= 8 && (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                          High importance
                        </span>
                      )}
                      {result.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {searchMode === "semantic" && semanticResults.length === 0 && !loading && searchQuery && (
        <div className="text-sm text-gray-400 text-center py-8">
          No knowledge graph matches found.
        </div>
      )}

      <MemoriaGrid
        entries={entries}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onToggleFavorite={handleToggleFavorite}
        togglingFavoriteId={togglingFavoriteId}
        onEntryClick={setSelectedEntry}
        onFilterByTitle={handleFilterByTitle}
        onFilterByAuthor={handleFilterByAuthor}
        total={totalRef.current}
        sort={sort}
        onSortChange={setSort}
      />
      <RandomModal
        open={showRandomModal}
        onClose={() => setShowRandomModal(false)}
        onToggleFavorite={handleToggleFavorite}
        togglingFavoriteId={togglingFavoriteId}
      />
      {selectedEntry && (
        <EntryDetailModal
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          entry={selectedEntry}
          tags={tags}
          onSaved={() => {
            fetchEntries(true);
            fetchTags();
            setSelectedEntry(null);
          }}
          onDelete={(id) => {
            setEntries((prev) => prev.filter((e) => e.id !== id));
            setSelectedEntry(null);
          }}
        />
      )}
    </div>
  );
}
