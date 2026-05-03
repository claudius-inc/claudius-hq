"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/markets/scanner/watchlist/refresh-proxy", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        toast(`Refreshed ${data.tickersProcessed} tickers`, "success");
        router.refresh();
      } else if (res.status === 503) {
        toast("Yahoo data unavailable; showing previous values", "error");
      } else if (res.status === 401) {
        toast("Sign in required", "error");
      } else {
        toast(data.error || "Refresh failed", "error");
      }
    } catch (err) {
      toast("Refresh failed", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[36px]"
      title={loading ? "Refreshing..." : "Refresh watchlist"}
    >
      {loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="hidden sm:inline">Refreshing</span>
        </>
      ) : (
        <>
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </>
      )}
    </button>
  );
}
