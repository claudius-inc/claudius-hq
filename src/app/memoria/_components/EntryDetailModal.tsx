"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Trash2, Link2, Sparkles, Plus, Loader2 } from "lucide-react";
import type { MemoriaEntry, MemoriaTag } from "../page";

const SOURCE_TYPES = ["book", "article", "podcast", "conversation", "thought", "tweet", "video"];

interface Props {
  open: boolean;
  onClose: () => void;
  entry: MemoriaEntry;
  tags: MemoriaTag[];
  onSaved: () => void;
  onDelete: (id: number) => void;
}

export function EntryDetailModal({ open, onClose, entry, tags, onSaved, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [sourceType, setSourceType] = useState(entry.sourceType);
  const [sourceTitle, setSourceTitle] = useState(entry.sourceTitle || "");
  const [sourceAuthor, setSourceAuthor] = useState(entry.sourceAuthor || "");
  const [sourceUrl, setSourceUrl] = useState(entry.sourceUrl || "");
  const [sourceLocation, setSourceLocation] = useState(entry.sourceLocation || "");
  const [myNote, setMyNote] = useState(entry.myNote || "");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    entry.tags?.map((t) => t.id) || []
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [related, setRelated] = useState<MemoriaEntry[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const fetchRelated = useCallback(async () => {
    setLoadingRelated(true);
    try {
      const res = await fetch(`/api/memoria/${entry.id}/related`);
      const data = await res.json();
      setRelated(data.related || []);
    } catch {
      setRelated([]);
    } finally {
      setLoadingRelated(false);
    }
  }, [entry.id]);

  useEffect(() => {
    if (open && !editing) fetchRelated();
  }, [open, editing, fetchRelated]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/memoria/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          source_type: sourceType,
          source_title: sourceTitle || null,
          source_author: sourceAuthor || null,
          source_url: sourceUrl || null,
          source_location: sourceLocation || null,
          my_note: myNote || null,
          tag_ids: selectedTagIds,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagInput.trim().toLowerCase();
    if (!name) return;
    try {
      const res = await fetch("/api/memoria/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.tag) {
        setSelectedTagIds((prev) => [...prev, data.tag.id]);
        setNewTagInput("");
        onSaved();
      }
    } catch {
      // ignore
    }
  };

  const handleSuggestTags = async () => {
    if (!content.trim()) return;
    setSuggestingTags(true);
    try {
      const res = await fetch("/api/memoria/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          source_type: sourceType,
          source_title: sourceTitle || undefined,
          source_author: sourceAuthor || undefined,
        }),
      });
      const data = await res.json();
      if (data.suggested_tags) {
        const newIds = data.suggested_tags.map((t: { id: number }) => t.id);
        setSelectedTagIds((prev) => {
          const merged = new Set([...prev, ...newIds]);
          return Array.from(merged);
        });
        if (data.suggested_tags.some((t: { isNew: boolean }) => t.isNew)) {
          onSaved();
        }
      }
    } finally {
      setSuggestingTags(false);
    }
  };

  if (!editing) {
    return (
      <Modal open={open} onClose={onClose} title="Entry Details">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="capitalize">{entry.sourceType}</span>
            {entry.sourceTitle && (
              <>
                <span className="text-gray-300">·</span>
                <span>{entry.sourceTitle}</span>
              </>
            )}
            {entry.sourceAuthor && (
              <>
                <span className="text-gray-300">·</span>
                <span>{entry.sourceAuthor}</span>
              </>
            )}
          </div>
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {entry.content}
          </div>
          {entry.sourceUrl && (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline block"
            >
              {entry.sourceUrl}
            </a>
          )}
          {entry.sourceLocation && (
            <div className="text-xs text-gray-400">Location: {entry.sourceLocation}</div>
          )}
          {entry.myNote && (
            <div className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
              {entry.myNote}
            </div>
          )}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-full"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-gray-300">
            Created {entry.createdAt}
          </div>
          {/* Related entries */}
          {!loadingRelated && related.length > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Link2 size={12} />
                <span className="font-medium">Related</span>
              </div>
              {related.map((r) => (
                <div
                  key={r.id}
                  className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed"
                >
                  <div className="line-clamp-2">{r.content}</div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {r.sourceType}
                    {r.sourceTitle ? ` — ${r.sourceTitle}` : ""}
                    {r.sourceAuthor ? ` by ${r.sourceAuthor}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setEditing(true)}
              className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Edit
            </button>
            {confirmDelete ? (
              <button
                onClick={() => onDelete(entry.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Confirm Delete
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Entry">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            >
              {SOURCE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Title</label>
            <input
              type="text"
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Author</label>
            <input
              type="text"
              value={sourceAuthor}
              onChange={(e) => setSourceAuthor(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">URL</label>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Location</label>
          <input
            type="text"
            value={sourceLocation}
            onChange={(e) => setSourceLocation(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Personal Note</label>
          <textarea
            value={myNote}
            onChange={(e) => setMyNote(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg resize-none"
          />
        </div>
        {tags.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Tags</label>
              <button
                type="button"
                onClick={handleSuggestTags}
                disabled={suggestingTags || !content.trim()}
                className="flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-700 disabled:opacity-50"
                title="Auto-suggest tags with AI"
              >
                {suggestingTags ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                {suggestingTags ? "Suggesting..." : "Suggest"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() =>
                    setSelectedTagIds((prev) =>
                      prev.includes(tag.id)
                        ? prev.filter((id) => id !== tag.id)
                        : [...prev, tag.id]
                    )
                  }
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTag();
                  }
                }}
                placeholder="New tag..."
                className="flex-1 px-2 py-0.5 text-[10px] border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={!newTagInput.trim()}
                className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-30"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(false)}
            className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
