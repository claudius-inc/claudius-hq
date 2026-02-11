"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "./ui/Spinner";

interface ResearchFormProps {
  initialTicker?: string;
}

export function ResearchForm({ initialTicker }: ResearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState(initialTicker || "");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Handle ?refresh=TICKER param from stock detail page
  useEffect(() => {
    const refreshTicker = searchParams.get("refresh");
    if (refreshTicker) {
      setTicker(refreshTicker.toUpperCase());
      // Clear the URL param without triggering navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("refresh");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-1">
          Enter Ticker Symbol
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL, MSFT, 9988.HK, NXT.AX"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            disabled={status === "loading"}
          />
          <button
            type="submit"
            disabled={!ticker.trim() || status === "loading"}
            className="shrink-0 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {status === "loading" && <Spinner size="sm" className="text-white" />}
            {status === "loading" ? "Queuing..." : "Research"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Without suffix = US stock. Use .HK, .SI, .AX, .L for other exchanges.
        </p>
      </div>

      {message && (
        <div
          className={`text-sm p-3 rounded-lg ${
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
