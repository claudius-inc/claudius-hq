"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./ui/Spinner";

interface ResearchFormProps {
  initialTicker?: string;
}

export function ResearchForm({ initialTicker }: ResearchFormProps) {
  const router = useRouter();
  const [ticker, setTicker] = useState(initialTicker || "");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Handle ?refresh=TICKER param from stock detail page (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const refreshTicker = url.searchParams.get("refresh");
      if (refreshTicker) {
        setTicker(refreshTicker.toUpperCase());
        // Clear the URL param without triggering navigation
        url.searchParams.delete("refresh");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/stocks/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.toUpperCase().trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(`Research queued for ${ticker.toUpperCase()}. Refreshing...`);
        setTicker("");
        // Refresh to show the new job (router.refresh forces ISR revalidation)
        setTimeout(() => {
          router.refresh();
          setStatus("idle");
          setMessage("");
        }, 500);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to queue research");
      }
    } catch (err) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          id="ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker, e.g. AAPL, 9988.HK"
          autoCapitalize="characters"
          autoComplete="off"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none sm:w-52"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={!ticker.trim() || status === "loading"}
          className="shrink-0 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {status === "loading" && <Spinner size="sm" className="text-white" />}
          {status === "loading" ? "Queuing..." : "Research"}
        </button>
      </div>

      {message && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
