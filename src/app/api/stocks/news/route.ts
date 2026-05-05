import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({
  ticker: z.string().min(1).max(20),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parse = paramsSchema.safeParse({
    ticker: searchParams.get("ticker"),
  });
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const { ticker } = parse.data;

  try {
    // Use Yahoo Finance news RSS via a simple feed parser approach
    // Fallback to web search if needed
    const headlines = await fetchYahooNews(ticker);
    return NextResponse.json({ ticker, headlines });
  } catch (e) {
    logger.error("stocks/news", `News fetch failed for ${ticker}`, { error: e });
    return NextResponse.json({ ticker, headlines: [] });
  }
}

interface NewsItem {
  title: string;
  url: string;
}

async function fetchYahooNews(ticker: string): Promise<NewsItem[]> {
  // Yahoo Finance RSS feed for a ticker
  const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;

  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/0.1)" },
    // @ts-expect-error Next.js fetch revalidate
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status}`);
  }

  const xml = await res.text();
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      if (title && !title.toLowerCase().includes("yahoo finance")) {
        items.push({
          title,
          url: linkMatch ? linkMatch[1].trim() : `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/news/`,
        });
      }
    }
  }

  return items.slice(0, 5);
}
