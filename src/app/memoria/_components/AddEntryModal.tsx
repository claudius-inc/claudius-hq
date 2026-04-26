"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { BulkReviewStep } from "./BulkReviewStep";
import { Sparkles, Plus, X, Loader2 } from "lucide-react";
import type { MemoriaTag } from "../page";

const SOURCE_TYPES = ["book", "article", "podcast", "conversation", "thought", "tweet", "video"];

interface Props {
  open: boolean;
  onClose: () => void;
  tags: MemoriaTag[];
  onSaved: () => void;
}

type Tab = "single" | "bulk" | "image";

interface ParsedEntry {
  content: string;
  sourceType: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  aiTags?: string[];
  aiSummary?: string;
}

export function AddEntryModal({ open, onClose, tags, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("single");
  const [saving, setSaving] = useState(false);

  // Single entry fields
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState("book");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceAuthor, setSourceAuthor] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceLocation, setSourceLocation] = useState("");
  const [myNote, setMyNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [suggestingTags, setSuggestingTags] = useState(false);

  // Bulk fields
  const [bulkText, setBulkText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[] | null>(null);
  const [parsing, setParsing] = useState(false);

  const reset = () => {
    setContent("");
    setSourceType("book");
    setSourceTitle("");
    setSourceAuthor("");
    setSourceUrl("");
    setSourceLocation("");
    setMyNote("");
    setSelectedTagIds([]);
    setNewTagInput("");
    setSuggestingTags(false);
    setBulkText("");
    setImageBase64(null);
    setImageName("");
    setParsedEntries(null);
    setParsing(false);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSaveSingle = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/memoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          source_type: sourceType,
          source_title: sourceTitle || undefined,
          source_author: sourceAuthor || undefined,
          source_url: sourceUrl || undefined,
          source_location: sourceLocation || undefined,
          my_note: myNote || undefined,
          tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        }),
      });
      onSaved();
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleParseText = async () => {
    if (!bulkText.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/memoria/extract/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: bulkText,
          source_type: sourceType,
          source_title: sourceTitle || undefined,
          source_author: sourceAuthor || undefined,
        }),
      });
      const data = await res.json();
      setParsedEntries(data.entries || []);
    } finally {
      setParsing(false);
    }
  };

  const handleParseImage = async () => {
    if (!imageBase64) return;
    setParsing(true);
    try {
      const res = await fetch("/api/memoria/extract/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          source_type: sourceType,
          source_title: sourceTitle || undefined,
          source_author: sourceAuthor || undefined,
        }),
      });
      const data = await res.json();
      setParsedEntries(data.entries || []);
    } finally {
      setParsing(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/...;base64, prefix
      const base64 = result.split(",")[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleBulkSave = async (entries: ParsedEntry[]) => {
    setSaving(true);
    try {
      for (const entry of entries) {
        await fetch("/api/memoria", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: entry.content,
            source_type: entry.sourceType,
            source_title: entry.sourceTitle || sourceTitle || undefined,
            source_author: entry.sourceAuthor || sourceAuthor || undefined,
          }),
        });
      }
      onSaved();
      handleClose();
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
        onSaved(); // refresh tags list
      }
    } catch {
      // ignore
    }
  };

  const handleSuggestTags = async () => {
    if (!content.trim() && !bulkText.trim()) return;
    setSuggestingTags(true);
    try {
      const res = await fetch("/api/memoria/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content || bulkText,
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
          onSaved(); // refresh tags list if new tags were created
        }
      }
    } finally {
      setSuggestingTags(false);
    }
  };

  if (parsedEntries) {
    return (
      <Modal open={open} onClose={handleClose} title="Review Extracted Entries">
        <BulkReviewStep
          entries={parsedEntries}
          saving={saving}
          onSave={handleBulkSave}
          onBack={() => setParsedEntries(null)}
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Entry">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100 pb-2">
        {(["single", "bulk", "image"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs rounded-md ${
              tab === t ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t === "single" ? "Single" : t === "bulk" ? "Bulk Text" : "Image"}
          </button>
        ))}
      </div>

      {/* Source fields (shared) */}
      <div className="space-y-3 mb-4">
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
              placeholder="Book title, article name..."
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
          {tab === "single" && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">URL</label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tab-specific content */}
      {tab === "single" && (
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Content *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Paste a quote, highlight, or write an idea..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Location</label>
            <input
              type="text"
              value={sourceLocation}
              onChange={(e) => setSourceLocation(e.target.value)}
              placeholder="Page number, chapter, timestamp..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Personal Note</label>
            <textarea
              value={myNote}
              onChange={(e) => setMyNote(e.target.value)}
              rows={2}
              placeholder="Why this matters to you..."
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
                    type="button"
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
                      e.stopPropagation();
                      handleCreateTag();
                    }
                  }}
                  placeholder="New tag..."
                  className="flex-1 px-2 py-0.5 text-[10px] border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handleCreateTag(); }}
                  disabled={!newTagInput.trim()}
                  className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-30"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "single" && (
        <button
          type="button"
          onClick={handleSaveSingle}
          disabled={!content.trim() || saving}
          className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 sticky bottom-0 bg-white border-t border-gray-100 pt-3 mt-2"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      )}

      {tab === "bulk" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Paste text to extract from</label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder="Paste a passage, multiple quotes, notes..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg resize-none"
            />
          </div>
          <button
            onClick={handleParseText}
            disabled={!bulkText.trim() || parsing}
            className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {parsing ? "Extracting with AI..." : "Parse with AI"}
          </button>
        </div>
      )}

      {tab === "image" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Upload image</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer text-sm text-gray-500 hover:text-gray-700"
              >
                {imageName || "Click to upload an image of text, highlights, or notes"}
              </label>
            </div>
          </div>
          <button
            onClick={handleParseImage}
            disabled={!imageBase64 || parsing}
            className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {parsing ? "Extracting with AI..." : "Extract with AI"}
          </button>
        </div>
      )}
    </Modal>
  );
}
