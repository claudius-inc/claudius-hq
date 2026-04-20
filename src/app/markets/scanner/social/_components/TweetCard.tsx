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
import type { TweetData, PriceData } from "../types";

interface TweetCardProps {
  tweet: TweetData;
  prices: Record<string, PriceData>;
  tickerFilter: string;
  onTickerClick: (ticker: string) => void;
}

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

// Highlight $TICKER in text, make them clickable
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

export function TweetCard({ tweet, prices, tickerFilter, onTickerClick }: TweetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const primaryTicker = tweet.tickers[0];
  const price = primaryTicker ? prices[primaryTicker] : null;

  // Determine if text needs truncation (rough: > 280 chars)
  const needsTruncation = tweet.text.length > 280;
  const displayText = expanded || !needsTruncation ? tweet.text : tweet.text.slice(0, 280) + "...";

  const tweetUrl = `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
      {/* Header: Ticker + Company + Time */}
      <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/markets/research/${primaryTicker}`}
            className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
          >
            {primaryTicker}
          </Link>
          {price?.name && (
            <span className="text-sm text-gray-500 truncate hidden sm:inline">
              {price.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{timeAgo(tweet.created_at)}</span>
          {tweet.bookmarks > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
              <Bookmark className="w-3 h-3" />
              {formatNumber(tweet.bookmarks)}
            </span>
          )}
        </div>
      </div>

      {/* Price row */}
      {price && (
        <div className="px-4 pb-2 flex items-center gap-3 text-sm">
          <span className="font-medium text-gray-900">{formatPrice(price.current_price)}</span>
          <span className={`font-medium ${getPercentColor(price.performance_1m)}`}>
            {formatPercent(price.performance_1m)} 1M
          </span>
          <span className={`font-medium ${getPercentColor(price.performance_1w)}`}>
            {formatPercent(price.performance_1w)} 1W
          </span>
        </div>
      )}

      {/* Tweet text */}
      <div className="px-4 pb-3">
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
      </div>

      {/* Media indicator */}
      {tweet.media_urls.length > 0 && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <ImageIcon className="w-3 h-3" />
            {tweet.media_urls.length} image{tweet.media_urls.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Footer: engagement + link */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
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
  );
}
