"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Heart,
  Repeat2,
  MessageCircle,
  Bookmark,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Sparkline } from "./Sparkline";
import { Skeleton } from "@/components/Skeleton";
import type { TweetData, PriceData } from "../types";



function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatPercent(val: number | null): string {
  if (val === null) return "—";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

function getPercentColor(val: number | null): string {
  if (val === null) return "text-gray-400";
  return val >= 0 ? "text-emerald-600" : "text-red-600";
}

function formatPrice(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1000) return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + val.toFixed(2);
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return mins + "m";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HighlightedText({
  text,
  onTickerClick,
  activeTicker,
}: {
  text: string;
  onTickerClick: (ticker: string) => void;
  activeTicker: string;
}) {
  const parts = text.split(/(\$[A-Z]{1,5}[.]?[A-Z]{0,2}\b)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("$")) {
          const ticker = part.slice(1);
          const isActive = ticker === activeTicker;
          return (
            <button
              key={i}
              onClick={() => onTickerClick(isActive ? "" : ticker)}
              className={`inline font-semibold rounded px-0.5 transition-colors ${
                isActive
                  ? "bg-emerald-100 text-emerald-700"
                  : "text-emerald-600 hover:bg-emerald-50"
              }`}
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

interface TweetCardProps {
  tweet: TweetData;
  prices: Record<string, PriceData>;
  priceLoading: boolean;
  tickerFilter: string;
  onTickerClick: (ticker: string) => void;
}

export function TweetCard({ tweet, prices, priceLoading, tickerFilter, onTickerClick }: TweetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const primaryTicker = tweet.tickers[0];
  const price = primaryTicker ? prices[primaryTicker] : null;

  const needsTruncation = tweet.text.length > 200;
  const displayText = expanded || !needsTruncation ? tweet.text : tweet.text.slice(0, 200) + "...";

  const tweetUrl = `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}`;
  const isPositive: boolean | null = price?.change_1d != null ? (price.change_1d ?? 0) >= 0 : null;

  const hasPrice = price?.current_price != null;
  const showPriceSkeleton = priceLoading && !hasPrice;

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
      <div className="flex">
        {/* Left: Price chart area */}
        <div className="w-28 sm:w-36 shrink-0 border-r border-gray-100 flex flex-col justify-center items-center py-3 px-2 gap-1 bg-gray-50/50">
          {/* Ticker badge */}
          <Link
            href={`/markets/research/${primaryTicker}`}
            className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            {primaryTicker}
          </Link>

          {showPriceSkeleton ? (
            <>
              <Skeleton className="h-4 w-14 mt-1" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-9 w-[90px] mt-1" />
            </>
          ) : (
            <>
              {/* Current price */}
              <span className="text-sm font-semibold text-gray-900 mt-0.5">
                {formatPrice(price?.current_price ?? null)}
              </span>

              {/* 1D change */}
              {price?.change_1d != null && (
                <span className={`text-xs font-medium ${getPercentColor(price.change_1d)}`}>
                  {formatPercent(price.change_1d)}
                </span>
              )}

              {/* Sparkline */}
              <Sparkline
                data={price?.sparkline || []}
                width={90}
                height={36}
                positive={isPositive}
                className="mt-1"
              />

              {/* Company name */}
              {price?.name && (
                <span className="text-[10px] text-gray-400 text-center leading-tight line-clamp-2 mt-0.5">
                  {price.name}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: Tweet content */}
        <div className="flex-1 min-w-0 py-3 pr-3 pl-3">
          {/* Header: time + bookmarks */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs text-gray-400">{timeAgo(tweet.created_at)}</span>
            {tweet.bookmarks > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                <Bookmark className="w-3 h-3" />
                {formatNumber(tweet.bookmarks)}
              </span>
            )}
          </div>

          {/* Tweet text */}
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            <HighlightedText
              text={displayText}
              onTickerClick={onTickerClick}
              activeTicker={tickerFilter}
            />
          </p>

          {needsTruncation && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-emerald-600 hover:text-emerald-700 mt-1 font-medium"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}

          {/* Quoted tweet */}
          {tweet.is_quote && tweet.quoted_text && (
            <div className="mt-2 pl-3 border-l-2 border-gray-200">
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {tweet.quoted_text.slice(0, 200)}
                {tweet.quoted_text.length > 200 && "..."}
              </p>
            </div>
          )}

          {/* Secondary tickers */}
          {tweet.tickers.length > 1 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {tweet.tickers.slice(1).map((t) => (
                <Link
                  key={t}
                  href={`/markets/research/${t}`}
                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-100 rounded border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-colors"
                >
                  {t}
                </Link>
              ))}
            </div>
          )}

          {/* Media indicator */}
          {tweet.media_urls.length > 0 && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <ImageIcon className="w-3 h-3" />
                {tweet.media_urls.length} image{tweet.media_urls.length > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Footer: engagement + link */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Heart className="w-3.5 h-3.5" />
                {formatNumber(tweet.likes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="w-3.5 h-3.5" />
                {formatNumber(tweet.retweets)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                {formatNumber(tweet.replies)}
              </span>
            </div>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              View
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
