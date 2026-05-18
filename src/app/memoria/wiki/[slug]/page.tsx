"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  Lightbulb,
  Link2,
  Calendar,
  FileText,
  Check,
  Quote,
} from "lucide-react";

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

export default function WikiDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [sourceEntries, setSourceEntries] = useState<
    Array<{
      id: number;
      content: string;
      sourceType: string;
      sourceTitle?: string | null;
      sourceAuthor?: string | null;
    }>
  >([]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memoria/wiki/${slug}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load wiki page");
        setPage(null);
        return;
      }
      const data = await res.json();
      setPage(data.page);
      setEditTitle(data.page.title);
      setEditContent(data.page.content);
    } catch (e) {
      setError(String(e));
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const fetchAllPages = useCallback(async () => {
    try {
      const res = await fetch("/api/memoria/wiki");
      const data = await res.json();
      setAllPages(data.pages || []);
    } catch {
      setAllPages([]);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/memoria/wiki/${slug}/sources`);
      const data = await res.json();
      setSourceEntries(data.entries || []);
    } catch {
      setSourceEntries([]);
    }
  }, [slug]);

  useEffect(() => {
    fetchPage();
    fetchAllPages();
    fetchSources();
  }, [fetchPage, fetchAllPages, fetchSources]);

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/memoria/wiki/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      const data = await res.json();
      setPage(data.page);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm("Delete this wiki page? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/memoria/wiki/${slug}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete");
        return;
      }
      router.push("/memoria/wiki");
    } catch (e) {
      setError(String(e));
    }
  };

  const getInsightIds = (p: WikiPage): string[] => {
    try {
      const ids = JSON.parse(p.sourceInsightIds);
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  };

  // Find backlinks: pages whose content contains a link to this page
  const backlinks = allPages.filter((p) => {
    if (p.slug === slug) return false;
    // Check if content references this page by title or slug
    return (
      p.content.toLowerCase().includes(slug.toLowerCase().replace(/-/g, " ")) ||
      p.content.toLowerCase().includes(page?.title.toLowerCase() || "")
    );
  });

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-1/3" />
        <div className="h-4 bg-gray-100 rounded w-1/4" />
        <div className="h-96 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="space-y-4">
        <Link
          href="/memoria/wiki"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Back to Wiki
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error || "Wiki page not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/memoria/wiki"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Back to Wiki
        </Link>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditTitle(page.title);
                  setEditContent(page.content);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Edit2 size={12} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title & Meta */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
        {editing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full text-lg md:text-xl font-bold text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <h1 className="text-lg md:text-xl font-bold text-gray-900">
            {page.title}
          </h1>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
          {page.clusterTopic && (
            <span className="flex items-center gap-1">
              <FileText size={12} />
              {page.clusterTopic}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            Generated {new Date(page.generatedAt).toLocaleDateString()}
          </span>
          {page.updatedAt !== page.generatedAt && (
            <span className="flex items-center gap-1">
              <Edit2 size={12} />
              Updated {new Date(page.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Main content + side panels */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[60vh] text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            ) : (
              <div className="prose prose-sm md:prose-base max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-strong:text-gray-900 prose-code:text-red-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {page.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Side panels */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-3">
          {/* Source Insights */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
              <Lightbulb size={14} className="text-amber-500" />
              <h3 className="text-xs font-semibold text-gray-700">
                Source Insights
              </h3>
              <span className="ml-auto text-xs text-gray-400">
                {getInsightIds(page).length}
              </span>
            </div>
            <div className="p-2 max-h-60 overflow-y-auto">
              {getInsightIds(page).length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-2">
                  No source insights recorded.
                </p>
              ) : (
                <ul className="space-y-1">
                  {getInsightIds(page).map((id, i) => (
                    <li
                      key={id}
                      className="flex items-center gap-1.5 text-xs text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
                    >
                      <Check size={10} className="text-green-500 shrink-0" />
                      <span className="truncate font-mono">{id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Source memoria entries */}
          {sourceEntries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
                <Quote size={14} className="text-emerald-500" />
                <h3 className="text-xs font-semibold text-gray-700">
                  Source Entries
                </h3>
                <span className="ml-auto text-xs text-gray-400">
                  {sourceEntries.length}
                </span>
              </div>
              <div className="p-2 max-h-72 overflow-y-auto space-y-1.5">
                {sourceEntries.map((e) => (
                  <Link
                    key={e.id}
                    href={`/memoria?entry=${e.id}`}
                    className="block bg-gray-50 hover:bg-emerald-50 rounded-lg px-2 py-1.5"
                  >
                    <div className="text-xs text-gray-700 line-clamp-2">
                      {e.content}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {e.sourceType}
                      {e.sourceTitle ? ` — ${e.sourceTitle}` : ""}
                      {e.sourceAuthor ? ` by ${e.sourceAuthor}` : ""}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Backlinks */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
              <Link2 size={14} className="text-blue-500" />
              <h3 className="text-xs font-semibold text-gray-700">
                Backlinks
              </h3>
              <span className="ml-auto text-xs text-gray-400">
                {backlinks.length}
              </span>
            </div>
            <div className="p-2 max-h-60 overflow-y-auto">
              {backlinks.length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-2">
                  No other pages link here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {backlinks.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/memoria/wiki/${p.slug}`}
                        className="block text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50 truncate"
                      >
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
