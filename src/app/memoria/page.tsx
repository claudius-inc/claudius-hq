"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function MemoriaPage() {
  const [entries, setEntries] = useState<MemoriaEntry[]>([]);
  const [tags, setTags] = useState<MemoriaTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSourceFilter, setActiveSourceFilter] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MemoriaEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSourceFilter) params.set("source_type", activeSourceFilter);
      if (activeTagFilter) params.set("tag", String(activeTagFilter));
      if (searchQuery) {
        const res = await fetch(`/api/memoria/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setEntries(data.entries || []);
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/memoria?${params.toString()}`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeSourceFilter, activeTagFilter, searchQuery]);

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
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleToggleFavorite = async (entry: MemoriaEntry) => {
    await fetch(`/api/memoria/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: entry.isFavorite ? 0 : 1 }),
    });
    fetchEntries();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/memoria/${id}`, { method: "DELETE" });
    setSelectedEntry(null);
    fetchEntries();
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
      />
      <InsightsPanel />
      <MemoriaGrid
        entries={entries}
        loading={loading}
        onToggleFavorite={handleToggleFavorite}
        onEntryClick={setSelectedEntry}
      />
      <AddEntryModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        tags={tags}
        onSaved={() => {
          fetchEntries();
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
            fetchEntries();
            fetchTags();
            setSelectedEntry(null);
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
