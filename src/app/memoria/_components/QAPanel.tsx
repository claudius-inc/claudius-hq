"use client";

import { useState, useRef, useCallback } from "react";
import { MessageSquare, Send, BookOpen, Loader2, X } from "lucide-react";

interface Citation {
  id: number;
  sourceTitle: string | null;
  sourceAuthor: string | null;
}

interface Props {
  onCitationClick: (entryId: number) => void;
}

export function QAPanel({ onCitationClick }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || loading) return;

    const q = question.trim();
    setQuestion("");
    setAnswer("");
    setCitations([]);
    setLoading(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/memoria/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setAnswer("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "citations") {
              setCitations(data.citations);
            } else if (data.type === "text") {
              setAnswer((prev) => prev + data.text);
            } else if (data.type === "error") {
              setAnswer((prev) => prev + "\n\nError: " + data.error);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAnswer("Failed to get response.");
      }
    } finally {
      setLoading(false);
    }
  }, [question, loading]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-900">Ask Your Collection</span>
        </div>
        {expanded ? <X size={14} className="text-gray-400" /> : <MessageSquare size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="Ask about your notes, highlights, quotes..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300"
              disabled={loading}
            />
            <button
              onClick={loading ? handleCancel : handleAsk}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              disabled={!question.trim() && !loading}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>

          {/* Answer */}
          {(answer || loading) && (
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {answer}
              {loading && !answer && (
                <span className="text-gray-400">Thinking...</span>
              )}
            </div>
          )}

          {/* Citations */}
          {citations.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <BookOpen size={10} />
                <span>Sources</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => onCitationClick(c.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    <BookOpen size={10} />
                    <span className="truncate max-w-[140px]">
                      {c.sourceTitle || "Untitled"}
                      {c.sourceAuthor ? ` — ${c.sourceAuthor}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
