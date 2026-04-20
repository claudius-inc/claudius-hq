"use client";

import { useState, useMemo } from "react";
import {
  Heart,
  Repeat2,
  ExternalLink,
  Image as ImageIcon,
  X,
} from "lucide-react";
import type { TweetData, PriceData } from "../types";

interface TickerTimelineProps {
  ticker: string;
  tweets: TweetData[];
  price: PriceData | undefined;
  onBack: () => void;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatPrice(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1000) return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + val.toFixed(2);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  return formatDate(dateStr);
}

interface ChartPoint {
  date: string;
  close: number;
}

interface TweetDot {
  x: number;
  y: number;
  tweet: TweetData;
  perfSince: number | null;
}

export function TickerTimeline({ ticker, tweets, price, onBack }: TickerTimelineProps) {
  const [selectedTweet, setSelectedTweet] = useState<TweetData | null>(null);
  const [hoveredTweet, setHoveredTweet] = useState<TweetData | null>(null);

  const sparkData = price?.sparkline || [];
  const chartWidth = 700;
  const chartHeight = 200;
  const padding = { top: 20, right: 16, bottom: 30, left: 16 };

  // Map tweet dates to chart coordinates
  const tweetDots = useMemo<TweetDot[]>(() => {
    if (sparkData.length < 2) return [];

    const closes = sparkData.map((d) => d.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const chartW = chartWidth - padding.left - padding.right;
    const chartH = chartHeight - padding.top - padding.bottom;

    return tweets
      .map((tweet) => {
        const tweetDate = new Date(tweet.created_at).toISOString().split("T")[0];

        // Find closest data point
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < sparkData.length; i++) {
          const dist = Math.abs(new Date(sparkData[i].date).getTime() - new Date(tweet.created_at).getTime());
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }

        // Only plot if within 2 days of a data point
        if (closestDist > 2 * 86400000) return null;

        const x = padding.left + (closestIdx / (sparkData.length - 1)) * chartW;
        const y = padding.top + chartH - ((sparkData[closestIdx].close - min) / range) * chartH;

        // Calculate performance since tweet
        const lastClose = closes[closes.length - 1];
        const tweetPrice = sparkData[closestIdx].close;
        const perfSince = tweetPrice > 0 ? ((lastClose - tweetPrice) / tweetPrice) * 100 : null;

        return { x, y, tweet, perfSince };
      })
      .filter(Boolean) as TweetDot[];
  }, [sparkData, tweets]);

  const activeTweet = selectedTweet || hoveredTweet;

  // Generate SVG path for the price line
  const pricePath = useMemo(() => {
    if (sparkData.length < 2) return "";
    const closes = sparkData.map((d) => d.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const chartW = chartWidth - padding.left - padding.right;
    const chartH = chartHeight - padding.top - padding.bottom;

    return sparkData
      .map((d, i) => {
        const x = padding.left + (i / (sparkData.length - 1)) * chartW;
        const y = padding.top + chartH - ((d.close - min) / range) * chartH;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [sparkData]);

  // Area fill path
  const areaPath = useMemo(() => {
    if (!pricePath) return "";
    const chartH = chartHeight - padding.top - padding.bottom;
    return `${pricePath} L ${padding.left + (chartWidth - padding.left - padding.right)},${padding.top + chartH} L ${padding.left},${padding.top + chartH} Z`;
  }, [pricePath]);

  const isPositive = price?.change_1d != null ? (price.change_1d ?? 0) >= 0 : null;
  const lineColor = isPositive === null ? "#6b7280" : isPositive ? "#059669" : "#dc2626";

  // Sorted tweets newest first for the list
  const sortedTweets = [...tweets].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const tweetUrl = activeTweet
    ? `https://x.com/${activeTweet.screen_name}/status/${activeTweet.tweet_id}`
    : "";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back
          </button>
          <span className="text-sm font-semibold text-gray-900">{ticker}</span>
          {price?.name && (
            <span className="text-xs text-gray-400 hidden sm:inline">{price.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-900">
            {formatPrice(price?.current_price ?? null)}
          </span>
          {price?.change_1d != null && (
            <span
              className={`text-xs font-medium ${
                price.change_1d >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {price.change_1d >= 0 ? "+" : ""}
              {price.change_1d.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Chart with tweet dots */}
      <div className="px-2 sm:px-4">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Area fill */}
          <path d={areaPath} fill={lineColor} opacity={0.05} />

          {/* Price line */}
          <path
            d={pricePath}
            stroke={lineColor}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* End dot */}
          {sparkData.length > 0 && (
            <circle
              cx={
                padding.left +
                ((sparkData.length - 1) / (sparkData.length - 1)) *
                  (chartWidth - padding.left - padding.right)
              }
              cy={
                (() => {
                  const closes = sparkData.map((d) => d.close);
                  const min = Math.min(...closes);
                  const max = Math.max(...closes);
                  const range = max - min || 1;
                  const chartH = chartHeight - padding.top - padding.bottom;
                  return (
                    padding.top +
                    chartH -
                    ((closes[closes.length - 1] - min) / range) * chartH
                  );
                })()
              }
              r={3}
              fill={lineColor}
            />
          )}

          {/* Tweet dots */}
          {tweetDots.map((dot, i) => {
            const isActive = activeTweet?.tweet_id === dot.tweet.tweet_id;
            const dotColor =
              dot.perfSince === null
                ? "#9ca3af"
                : dot.perfSince >= 0
                  ? "#059669"
                  : "#dc2626";
            return (
              <g
                key={dot.tweet.tweet_id + "-" + i}
                onClick={() =>
                  setSelectedTweet(
                    selectedTweet?.tweet_id === dot.tweet.tweet_id ? null : dot.tweet
                  )
                }
                onMouseEnter={() => setHoveredTweet(dot.tweet)}
                onMouseLeave={() => setHoveredTweet(null)}
                className="cursor-pointer"
              >
                {/* Vertical dashed line to bottom */}
                {isActive && (
                  <line
                    x1={dot.x}
                    y1={dot.y}
                    x2={dot.x}
                    y2={chartHeight - padding.bottom}
                    stroke={dotColor}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.5}
                  />
                )}
                {/* Outer ring */}
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={isActive ? 7 : 5}
                  fill="white"
                  stroke={dotColor}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                {/* Inner dot */}
                <circle cx={dot.x} cy={dot.y} r={isActive ? 3.5 : 2.5} fill={dotColor} />
              </g>
            );
          })}

          {/* Date labels */}
          {sparkData.length > 0 && (
            <>
              <text
                x={padding.left}
                y={chartHeight - 4}
                fontSize={10}
                fill="#9ca3af"
                textAnchor="start"
              >
                {formatDate(sparkData[0].date)}
              </text>
              <text
                x={chartWidth - padding.right}
                y={chartHeight - 4}
                fontSize={10}
                fill="#9ca3af"
                textAnchor="end"
              >
                {formatDate(sparkData[sparkData.length - 1].date)}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Selected tweet panel */}
      {activeTweet && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">{timeAgo(activeTweet.created_at)}</span>
                {(() => {
                  const dot = tweetDots.find((d) => d.tweet.tweet_id === activeTweet.tweet_id);
                  return dot?.perfSince != null ? (
                    <span
                      className={`text-xs font-medium ${
                        dot.perfSince >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {dot.perfSince >= 0 ? "+" : ""}
                      {dot.perfSince.toFixed(1)}% since
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {activeTweet.text}
              </p>
              {activeTweet.media_urls.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <ImageIcon className="w-3 h-3" />
                  {activeTweet.media_urls.length} image{activeTweet.media_urls.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  {formatNumber(activeTweet.likes)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Repeat2 className="w-3.5 h-3.5" />
                  {formatNumber(activeTweet.retweets)}
                </span>
              </div>
              <a
                href={`https://x.com/${activeTweet.screen_name}/status/${activeTweet.tweet_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {selectedTweet && (
                <button
                  onClick={() => setSelectedTweet(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tweet list */}
      <div className="divide-y divide-gray-100">
        {sortedTweets.map((tweet) => {
          const dot = tweetDots.find((d) => d.tweet.tweet_id === tweet.tweet_id);
          return (
            <div
              key={tweet.tweet_id}
              onClick={() =>
                setSelectedTweet(
                  selectedTweet?.tweet_id === tweet.tweet_id ? null : tweet
                )
              }
              className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                selectedTweet?.tweet_id === tweet.tweet_id
                  ? "bg-emerald-50/50"
                  : "hover:bg-gray-50"
              }`}
            >
              <span className="text-xs text-gray-400 w-12 shrink-0">
                {formatDate(tweet.created_at)}
              </span>
              <p className="text-sm text-gray-600 flex-1 min-w-0 truncate">
                {tweet.text.slice(0, 80)}
                {tweet.text.length > 80 && "..."}
              </p>
              {dot?.perfSince != null && (
                <span
                  className={`text-xs font-medium shrink-0 ${
                    dot.perfSince >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {dot.perfSince >= 0 ? "+" : ""}
                  {dot.perfSince.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
