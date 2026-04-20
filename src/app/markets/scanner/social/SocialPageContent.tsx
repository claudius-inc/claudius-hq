"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { ExternalLink, RefreshCw } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Skeleton } from "@/components/Skeleton";
import { FilterBar } from "./_components/FilterBar";
import { TweetCard } from "./_components/TweetCard";
import type { TweetData, PriceData, SocialStats as SocialStatsType } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export function SocialPageContent() {
  const [period, setPeriod] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState<string>("");

  // Fetch tweets
  const { data: tweetsData, mutate: mutateTweets, isLoading: loadingTweets } = useSWR(
    `/api/social/tweets?limit=100${period ? `&period=${period}` : ""}${tickerFilter ? `&ticker=${tickerFilter}` : ""}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );

  // Fetch stats
  const { data: stats } = useSWR("/api/social/stats", fetcher, {
    refreshInterval: 5 * 60 * 1000,
  });

  // Fetch prices for all tickers
  const allTickers = tweetsData?.all_tickers || [];
  const { data: pricesData } = useSWR(
    allTickers.length > 0 ? `/api/social/prices?tickers=${allTickers.join(",")}` : null,
    fetcher
  );

  const prices: Record<string, PriceData> = pricesData?.prices || {};
  const tweets: TweetData[] = tweetsData?.tweets || [];

  const handleRefresh = useCallback(() => {
    mutateTweets();
  }, [mutateTweets]);

  // Update engagement counts in real-time from stats
  const topTickers = (stats as SocialStatsType)?.top_tickers || [];

  return (
    <div className="space-y-4">
      <PageHero
        title="Social Alpha"
        subtitle={`@aleabitoreddit · ${stats?.unique_tickers || 0} tickers · ${stats?.total_tweets || 0} tweets`}
        actionSlot={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Trending ticker pills */}
      {topTickers.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1 -mx-1">
          <span className="text-xs text-gray-400 whitespace-nowrap font-medium">Trending:</span>
          {topTickers.slice(0, 5).map((t) => (
            <button
              key={t.ticker}
              onClick={() => setTickerFilter(tickerFilter === t.ticker ? "" : t.ticker)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap touch-manipulation ${
                tickerFilter === t.ticker
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
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
        onTickerFilterChange={setTickerFilter}
      />

      {loadingTweets ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-3 w-24" />
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
              tickerFilter={tickerFilter}
              onTickerClick={setTickerFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
