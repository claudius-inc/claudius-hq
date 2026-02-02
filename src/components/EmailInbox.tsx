"use client";

import { useState, useEffect, useCallback } from "react";
import { Email } from "@/lib/types";

type Filter = "all" | "read" | "unread";

export function EmailInbox() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Email | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [pages, setPages] = useState(1);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (filter !== "all") params.set("filter", filter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/integrations/email?${params}`);
      const data = await res.json();
      setEmails(data.emails || []);
      setTotal(data.total || 0);
      setUnread(data.unread || 0);
      setPages(data.pages || 1);
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    }
    setLoading(false);
  }, [page, filter, search]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const markRead = async (id: number) => {
    await fetch("/api/integrations/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_read: true }),
    });
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, is_read: 1 } : e))
    );
    if (selected?.id === id) setSelected({ ...selected, is_read: 1 });
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/integrations/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true, is_read: true }),
    });
    setEmails((prev) => prev.map((e) => ({ ...e, is_read: 1 })));
    setUnread(0);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);

    if (diffH < 1) return `${Math.round(diffMs / 60000)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    if (diffH < 48) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const extractName = (addr: string) => {
    // "Name <email>" → "Name", otherwise the address
    const match = addr.match(/^(.+?)\s*<.+>$/);
    return match ? match[1].replace(/"/g, "") : addr;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search emails..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <button type="submit" className="btn-secondary text-sm !py-1.5">
            Search
          </button>
        </form>

        <div className="flex gap-1">
          {(["all", "unread", "read"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                filter === f
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "All" : f === "unread" ? `Unread (${unread})` : "Read"}
            </button>
          ))}
        </div>

        {unread > 0 && (
          <button onClick={markAllRead} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Email List */}
        <div className="w-full md:w-2/5 overflow-y-auto border border-gray-200 rounded-lg bg-white">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {search ? "No emails match your search" : "No emails yet"}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelected(email);
                    if (!email.is_read) markRead(email.id);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selected?.id === email.id ? "bg-emerald-50 border-l-2 border-emerald-500" : ""
                  } ${!email.is_read ? "bg-blue-50/50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!email.is_read ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                      {extractName(email.from_address)}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1.5">
                      {!email.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />}
                      {formatDate(email.created_at)}
                    </span>
                  </div>
                  <div className={`text-sm truncate mt-0.5 ${!email.is_read ? "font-medium text-gray-800" : "text-gray-500"}`}>
                    {email.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {email.body_text?.slice(0, 100) || "(no preview)"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-400">
                {page} / {pages} ({total} total)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Email Detail */}
        <div className="hidden md:flex flex-col flex-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {selected.subject || "(no subject)"}
                  </h2>
                  {!selected.is_read && (
                    <button
                      onClick={() => markRead(selected.id)}
                      className="status-badge bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Mark read
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="text-gray-700 font-medium">{selected.from_address}</span>
                  <span className="text-gray-300">→</span>
                  <span className="text-gray-500">{selected.to_address}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(selected.created_at + "Z").toLocaleString()}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {selected.body_html ? (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: selected.body_html }}
                  />
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                    {selected.body_text || "(empty)"}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <span className="text-4xl block mb-2">📬</span>
                <p className="text-sm">Select an email to read</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
