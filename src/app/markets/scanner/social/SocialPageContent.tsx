"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { RefreshCw, TrendingUp, Check } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Skeleton } from "@/components/Skeleton";
import { FilterBar } from "./_components/FilterBar";
import { TweetCard } from "./_components/TweetCard";
import { TickerTimeline } from "./_components/TickerTimeline";
import type { TweetData, PriceData, SocialStats } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  // ET is UTC-4 (EDT) or UTC-5 (EST). Use a simple approximation.
  const etHour = (now.getUTCHours() - 4 + 24) % 24;
  const etMinute = now.getUTCMinutes();
  const totalMinutes = etHour * 60 + etMinute;
  return totalMinutes >= 570 && totalMinutes <= 960; // 9:30 AM - 4:00 PM ET
}

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "Last synced: just now";
  if (diffMin < 60) return `Last synced: ${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `Last synced: ${hours}h ago`;
  return `Last synced: ${Math.floor(hours / 24)}d ago`;
}

export function SocialPageContent() {
  const [period, setPeriod] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState<string>("");
  const [timelineTicker, setTimelineTicker] = useState<string | null>(null);

  const marketHours = useMemo(() => isMarketHours(), []);

  // Fetch tweets (fast, from Turso)
  const tweetsUrl = `/api/social/tweets?limit=100${period ? `&period=${period}` : ""}${tickerFilter ? `&ticker=${tickerFilter}` : ""}`;
  const { data: tweetsData, mutate: mutateTweets, isLoading: loadingTweets, isValidating: validatingTweets } = useSWR(
    tweetsUrl,
    fetcher,
    {
      dedupingInterval: 2000,
      revalidateOnFocus: true,
      keepPreviousData: true,
      refreshInterval: 5 * 60 * 1000,
    }
  );

  // Fetch stats (fast, from Turso)
  const { data: stats } = useSWR<SocialStats>("/api/social/stats", fetcher, {
    dedupingInterval: 300000,
    refreshInterval: 5 * 60 * 1000,
  });

  // Fetch prices independently (slow, from Yahoo Finance)
  const allTickers = tweetsData?.all_tickers || [];
  const { data: pricesData, isLoading: loadingPrices } = useSWR(
    allTickers.length > 0 ? `/api/social/prices?tickers=${allTickers.join(",")}` : null,
    fetcher,
    {
      dedupingInterval: marketHours ? 60000 : 1800000,
      keepPreviousData: true,
    }
  );

  const prices: Record<string, PriceData> = pricesData?.prices || {};
  const tweets: TweetData[] = tweetsData?.tweets || [];
  const lastSynced = tweetsData?.last_synced || null;

  // Tweets for the selected timeline ticker
  const timelineTweets = useMemo(() => {
    if (!timelineTicker || !tweetsData) return [];
    return (tweetsData.tweets as TweetData[]).filter(
      (t) => t.tickers.includes(timelineTicker) || t.quoted_tickers.includes(timelineTicker)
    );
  }, [timelineTicker, tweetsData]);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<number | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/social/sync", { method: "POST" });
      const data = await res.json();
      if (data.new_tweets > 0) {
        setSyncResult(data.new_tweets);
      }
    } catch {
      // Silent fail — still revalidate local data
    } finally {
      setSyncing(false);
      mutateTweets();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => setSyncResult(null), 3000);
    }
  }, [mutateTweets]);

  const handleTickerClick = useCallback((ticker: string) => {
    if (ticker === "") {
      setTickerFilter("");
      setTimelineTicker(null);
    } else {
      setTickerFilter(ticker);
      setTimelineTicker(ticker);
    }
  }, []);

  const topTickers = stats?.top_tickers || [];

  // Build subtitle with last synced and market status
  const subtitle = useMemo(() => {
    const parts = [`@aleabitoreddit · ${stats?.unique_tickers || 0} tickers · ${stats?.total_tweets || 0} tweets`];
    const syncLabel = formatLastSynced(lastSynced);
    if (syncLabel) {
      const marketLabel = marketHours ? "Prices: live" : "Prices: as of 4:00 PM ET";
      parts.push(`${syncLabel} · ${marketLabel}`);
    }
    return parts.join(" · ");
  }, [stats, lastSynced, marketHours]);

  // If a timeline ticker is selected, show the timeline view
  if (timelineTicker) {
    return (
      <div className="space-y-4">
        <PageHero
          title={timelineTicker}
          subtitle={`${timelineTweets.length} tweets · ${stats?.total_tweets || 0} total`}
          actionSlot={
            <div className="flex items-center gap-3">
              {validatingTweets && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={syncing}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation disabled:opacity-50 relative"
                title="Sync new tweets"
              >
                {syncResult !== null ? (
                  <span className="flex items-center gap-1">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-medium text-emerald-600">+{syncResult}</span>
                  </span>
                ) : (
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                )}
              </button>
            </div>
          }
        />
        <TickerTimeline
          ticker={timelineTicker}
          tweets={timelineTweets}
          price={prices[timelineTicker]}
          priceLoading={!prices[timelineTicker]}
          onBack={() => {
            setTimelineTicker(null);
            setTickerFilter("");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHero
        title="Social Alpha"
        subtitle={subtitle}
        actionSlot={
          <div className="flex items-center gap-3">
            {validatingTweets && !loadingTweets && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation disabled:opacity-50 relative"
              title="Sync new tweets"
            >
              {syncResult !== null ? (
                <span className="flex items-center gap-1">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-medium text-emerald-600">+{syncResult}</span>
                </span>
              ) : (
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              )}
            </button>
          </div>
        }
      />

      {/* Trending ticker pills */}
      {topTickers.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1 -mx-1">
          <span className="text-xs text-gray-400 whitespace-nowrap font-medium">Trending:</span>
          {topTickers.slice(0, 8).map((t) => (
            <button
              key={t.ticker}
              onClick={() => handleTickerClick(tickerFilter === t.ticker ? "" : t.ticker)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap touch-manipulation ${
                tickerFilter === t.ticker
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              {t.ticker}
              <span className="text-[10px] opacity-60">{t.count}x</span>
            </button>
          ))}
        </div>
      )}

      <FilterBar
        period={period}
        tickerFilter={tickerFilter}
        onPeriodChange={setPeriod}
        onTickerFilterChange={(v) => handleTickerClick(v)}
      />

      {loadingTweets && !tweetsData ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 flex">
              <div className="w-28 sm:w-36 shrink-0 border-r border-gray-100 bg-gray-50/50 p-3 space-y-2">
                <Skeleton className="h-5 w-14 mx-auto" />
                <Skeleton className="h-4 w-16 mx-auto" />
                <Skeleton className="h-9 w-20 mx-auto" />
              </div>
              <div className="flex-1 p-3 space-y-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
                <div className="pt-2 border-t border-gray-100 mt-2">
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tweets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No tweets found</p>
          <p className="text-xs mt-1">Check back after the next sync</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tweets.map((tweet) => (
            <TweetCard
              key={tweet.tweet_id}
              tweet={tweet}
              prices={prices}
              priceLoading={loadingPrices}
              tickerFilter={tickerFilter}
              onTickerClick={handleTickerClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
