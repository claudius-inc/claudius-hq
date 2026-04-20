"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { RefreshCw, TrendingUp } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Skeleton } from "@/components/Skeleton";
import { FilterBar } from "./_components/FilterBar";
import { TweetCard } from "./_components/TweetCard";
import { TickerTimeline } from "./_components/TickerTimeline";
import type { TweetData, PriceData, SocialStats } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export function SocialPageContent() {
  const [period, setPeriod] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState<string>("");
  const [timelineTicker, setTimelineTicker] = useState<string | null>(null);

  // Fetch tweets
  const { data: tweetsData, mutate: mutateTweets, isLoading: loadingTweets } = useSWR(
    `/api/social/tweets?limit=100${period ? `&period=${period}` : ""}${tickerFilter ? `&ticker=${tickerFilter}` : ""}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );

  // Fetch stats
  const { data: stats } = useSWR<SocialStats>("/api/social/stats", fetcher, {
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

  // Tweets for the selected timeline ticker (use ALL tweets, not filtered)
  const timelineTweets = useMemo(() => {
    if (!timelineTicker || !tweetsData) return [];
    return (tweetsData.tweets as TweetData[]).filter(
      (t) => t.tickers.includes(timelineTicker) || t.quoted_tickers.includes(timelineTicker)
    );
  }, [timelineTicker, tweetsData]);

  const handleRefresh = useCallback(() => {
    mutateTweets();
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

  // If a timeline ticker is selected, show the timeline view
  if (timelineTicker && timelineTweets.length > 0) {
    return (
      <div className="space-y-4">
        <PageHero
          title={timelineTicker}
          subtitle={`${timelineTweets.length} tweets · ${stats?.total_tweets || 0} total`}
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
        <TickerTimeline
          ticker={timelineTicker}
          tweets={timelineTweets}
          price={prices[timelineTicker]}
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

      {loadingTweets ? (
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
              tickerFilter={tickerFilter}
              onTickerClick={handleTickerClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
