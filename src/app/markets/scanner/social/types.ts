export interface TweetData {
  id: number;
  tweet_id: string;
  author: string;
  screen_name: string;
  text: string;
  tickers: string[];
  likes: number;
  retweets: number;
  replies: number;
  bookmarks: number;
  views: number;
  created_at: string;
  media_urls: string[];
  is_quote: boolean;
  quoted_text: string | null;
  quoted_tickers: string[];
}

export interface PriceData {
  ticker: string;
  name: string | null;
  current_price: number | null;
  change_1d: number | null;
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
  sparkline: Array<{ date: string; close: number }>;
}

export interface SocialStats {
  total_tweets: number;
  unique_tickers: number;
  top_tickers: Array<{ ticker: string; count: number }>;
  latest_fetch: string | null;
}
