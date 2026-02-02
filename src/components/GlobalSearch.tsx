"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface SearchResults {
  projects: { id: number; name: string; description: string; status: string }[];
  tasks: { id: number; title: string; status: string; priority: string; project_name: string }[];
  activity: { id: number; title: string; type: string; created_at: string; project_name: string }[];
  comments: { id: number; text: string; target_type: string; target_id: number; author: string }[];
  research: { id: number; title: string; note_type: string; created_at: string; project_name: string }[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || null);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasResults =
    results &&
    (results.projects.length > 0 ||
      results.tasks.length > 0 ||
      results.activity.length > 0 ||
      results.comments.length > 0 ||
      results.research.length > 0);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-40 lg:w-56 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 placeholder-gray-400"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute right-0 top-full mt-1 w-80 lg:w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          {!hasResults && !loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {results?.projects && results.projects.length > 0 && (
            <ResultGroup title="Projects" emoji="📁">
              {results.projects.map((p) => (
                <ResultItem
                  key={p.id}
                  href={`/projects/${p.id}`}
                  title={p.name}
                  subtitle={p.description}
                  badge={p.status}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ResultGroup>
          )}

          {results?.tasks && results.tasks.length > 0 && (
            <ResultGroup title="Tasks" emoji="✅">
              {results.tasks.map((t) => (
                <ResultItem
                  key={t.id}
                  href={`/tasks`}
                  title={t.title}
                  subtitle={t.project_name}
                  badge={t.priority}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ResultGroup>
          )}

          {results?.activity && results.activity.length > 0 && (
            <ResultGroup title="Activity" emoji="⚡">
              {results.activity.map((a) => (
                <ResultItem
                  key={a.id}
                  href="/activity"
                  title={a.title}
                  subtitle={a.project_name || a.type}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ResultGroup>
          )}

          {results?.research && results.research.length > 0 && (
            <ResultGroup title="Research" emoji="🔬">
              {results.research.map((r) => (
                <ResultItem
                  key={r.id}
                  href="/research"
                  title={r.title}
                  subtitle={r.project_name || r.note_type}
                  badge={r.note_type}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ResultGroup>
          )}

          {results?.comments && results.comments.length > 0 && (
            <ResultGroup title="Comments" emoji="💬">
              {results.comments.map((c) => (
                <ResultItem
                  key={c.id}
                  href={c.target_type === "project" ? `/projects/${c.target_id}` : "/activity"}
                  title={c.text.length > 60 ? c.text.slice(0, 60) + "…" : c.text}
                  subtitle={`${c.author} · ${c.target_type}`}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider bg-gray-50/50">
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}

function ResultItem({
  href,
  title,
  subtitle,
  badge,
  onClick,
}: {
  href: string;
  title: string;
  subtitle?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-2 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-900 truncate">{title}</span>
        {badge && (
          <span className="status-badge bg-gray-100 text-gray-500 text-[10px] shrink-0">
            {badge.replace("_", " ")}
          </span>
        )}
      </div>
      {subtitle && (
        <span className="text-xs text-gray-400 truncate block">{subtitle}</span>
      )}
    </Link>
  );
}
