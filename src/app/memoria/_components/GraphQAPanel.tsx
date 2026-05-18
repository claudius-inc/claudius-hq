"use client";

import { useState, useRef, useCallback } from "react";
import {
  MessageSquare,
  Send,
  BookOpen,
  Loader2,
  X,
  BrainCircuit,
  Footprints,
} from "lucide-react";

interface GraphCitation {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  hopDistance: number;
}

interface Props {
  allNodes: Array<{
    id: string;
    content: string;
    category: string;
    importance: number;
    entities: string[];
    tags: string[];
  }>;
  onCitationClick: (nodeId: string) => void;
}

export function GraphQAPanel({ allNodes, onCitationClick }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<GraphCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"traversing" | "synthesizing" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || loading) return;

    const q = question.trim();
    setQuestion("");
    setAnswer("");
    setCitations([]);
    setLoading(true);
    setLoadingStage("traversing");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/memoria/graph-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, hopDepth: 1 }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setAnswer(errData.error || "Something went wrong. Please try again.");
        setLoading(false);
        setLoadingStage(null);
        return;
      }

      setLoadingStage("synthesizing");

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
              setCitations(data.citations || []);
            } else if (data.type === "text") {
              setAnswer((prev) => prev + data.text);
            } else if (data.type === "error") {
              setAnswer((prev) => prev + "\n\nError: " + data.error);
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setAnswer("Failed to get response.");
      }
    } finally {
      setLoading(false);
      setLoadingStage(null);
    }
  }, [question, loading]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setLoadingStage(null);
  };

  const handleCitationClick = (nodeId: string) => {
    const node = allNodes.find((n) => n.id === nodeId);
    if (node) {
      onCitationClick(nodeId);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-purple-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={16} className="text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">Ask the Knowledge Graph</span>
          <span className="text-[11px] text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
            {allNodes.length} nodes
          </span>
        </div>
        {expanded ? (
          <X size={14} className="text-gray-400" />
        ) : (
          <MessageSquare size={14} className="text-gray-400" />
        )}
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
              placeholder="Ask about connections, themes, your insights..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
              disabled={loading}
            />
            <button
              onClick={loading ? handleCancel : handleAsk}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              disabled={!question.trim() && !loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>

          {/* Loading stage indicator */}
          {loading && loadingStage && (
            <div className="flex items-center gap-2 text-xs text-purple-600">
              {loadingStage === "traversing" ? (
                <>
                  <Footprints size={14} className="animate-pulse" />
                  <span>Traversing graph...</span>
                </>
              ) : (
                <>
                  <BrainCircuit size={14} className="animate-pulse" />
                  <span>Synthesizing...</span>
                </>
              )}
            </div>
          )}

          {/* Answer */}
          {(answer || loading) && (
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {answer}
              {loading && !answer && (
                <span className="text-gray-400">Waiting for response...</span>
              )}
            </div>
          )}

          {/* Citations */}
          {citations.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <BookOpen size={10} />
                <span>Graph Nodes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => handleCitationClick(c.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors"
                    title={`${c.content} | ${c.category}, importance ${c.importance}`}
                  >
                    <BookOpen size={10} />
                    <span className="truncate max-w-[140px]">
                      [{i + 1}] {c.content.length > 40 ? c.content.slice(0, 40) + "..." : c.content}
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
