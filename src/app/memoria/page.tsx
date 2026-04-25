"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MemoriaHeader } from "./_components/MemoriaHeader";
import { MemoriaFilters } from "./_components/MemoriaFilters";
import { MemoriaGrid } from "./_components/MemoriaGrid";
import { AddEntryModal } from "./_components/AddEntryModal";
import { RandomModal } from "./_components/RandomModal";
import { EntryDetailModal } from "./_components/EntryDetailModal";
import { InsightsPanel } from "./_components/InsightsPanel";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [favouriteFilter, setFavouriteFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
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
      if (searchQuery) {
        const res = await fetch(`/api/memoria/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setEntries(data.entries || []);
        setHasMore(false);
        return;
      }

      const params = new URLSearchParams();
      if (activeSourceFilter) params.set("source_type", activeSourceFilter);
      if (activeTagFilter) params.set("tag", String(activeTagFilter));
      if (favouriteFilter) params.set("favorite", "1");
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
  }, [activeSourceFilter, activeTagFilter, searchQuery, favouriteFilter, entries.length]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchEntries(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceFilter, activeTagFilter, searchQuery, favouriteFilter]);

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

  const handleToggleFavorite = async (entry: MemoriaEntry) => {
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
        onAddClick={() => setShowAddModal(true)}
        onRandomClick={() => setShowRandomModal(true)}
      />
      <MemoriaFilters
        activeSourceFilter={activeSourceFilter}
        onSourceFilterChange={setActiveSourceFilter}
        activeTagFilter={activeTagFilter}
        onTagFilterChange={setActiveTagFilter}
        tags={tags}
        favouriteFilter={favouriteFilter}
        onToggleFavouriteFilter={handleToggleFavouriteFilter}
      />
      <InsightsPanel />
      <MemoriaGrid
        entries={entries}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onToggleFavorite={handleToggleFavorite}
        onEntryClick={setSelectedEntry}
      />
      <AddEntryModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        tags={tags}
        onSaved={() => {
          fetchEntries(true);
          fetchTags();
        }}
      />
      <RandomModal
        open={showRandomModal}
        onClose={() => setShowRandomModal(false)}
        onToggleFavorite={handleToggleFavorite}
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
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
