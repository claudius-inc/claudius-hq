"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, FileText, Calendar, Lightbulb, Trash2, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { MemoriaHeader } from "../_components/MemoriaHeader";

interface WikiPage {
  id: number;
  slug: string;
  title: string;
  content: string;
  sourceInsightIds: string;
  clusterTopic: string | null;
  generatedAt: string;
  updatedAt: string;
}

export default function WikiIndexPage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateTitle, setGenerateTitle] = useState("");

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memoria/wiki");
      const data = await res.json();
      setPages(data.pages || []);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const filteredPages = pages.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.clusterTopic || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGenerate = async () => {
    if (!generateTopic.trim() && !generateTitle.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/memoria/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: generateTopic.trim() || undefined,
          title: generateTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error || "Failed to generate wiki page");
        return;
      }
      setShowGenerateModal(false);
      setGenerateTopic("");
      setGenerateTitle("");
      fetchPages();
    } catch (e) {
      setGenerateError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm("Delete this wiki page?")) return;
    try {
      await fetch(`/api/memoria/wiki/${slug}`, { method: "DELETE" });
      fetchPages();
    } catch {
      // ignore
    }
  };

  const getInsightCount = (page: WikiPage) => {
    try {
      const ids = JSON.parse(page.sourceInsightIds);
      return Array.isArray(ids) ? ids.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-4">
      <MemoriaHeader
        searchQuery=""
        onSearchChange={() => {}}
        searchMode="text"
        onSearchModeChange={() => {}}
        onRandomClick={() => {}}
        total={pages.length}
      />

      {/* Search + Generate bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search wiki pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Generate New
        </button>
      </div>

      {/* Wiki pages grid */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No wiki pages found.</p>
          {searchQuery && (
            <p className="text-xs mt-1">Try adjusting your search.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPages.map((page) => (
            <div
              key={page.id}
              className="group bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link
                  href={`/memoria/wiki/${page.slug}`}
                  className="flex-1 min-w-0"
                >
                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                    {page.title}
                  </h3>
                </Link>
                <button
                  onClick={() => handleDelete(page.slug)}
                  className="shrink-0 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {page.clusterTopic && (
                <p className="text-xs text-gray-500 mb-2 truncate">
                  Topic: {page.clusterTopic}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(page.generatedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Lightbulb size={12} />
                  {getInsightCount(page)} insights
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Generate Wiki Page
              </h3>
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenerateError(null);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Topic
                </label>
                <input
                  type="text"
                  placeholder="e.g., machine learning, finance, leadership"
                  value={generateTopic}
                  onChange={(e) => setGenerateTopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Leave empty to auto-cluster from all insights.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  placeholder="Custom title"
                  value={generateTitle}
                  onChange={(e) => setGenerateTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {generateError && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {generateError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowGenerateModal(false);
                    setGenerateError(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || (!generateTopic.trim() && !generateTitle.trim())}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generating && <Loader2 size={12} className="animate-spin" />}
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
