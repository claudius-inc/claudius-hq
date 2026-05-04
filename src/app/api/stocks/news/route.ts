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

async function fetchYahooNews(ticker: string): Promise<string[]> {
  // Yahoo Finance RSS feed for a ticker
  const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;

  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/0.1)" },
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status}`);
  }

  const xml = await res.text();
  // Simple regex extraction of <title> elements (excluding channel title)
  const titles: string[] = [];
  const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const title = match[1].replace(/<[^>]+>/g, "").trim();
    if (title && !title.toLowerCase().includes("yahoo finance")) {
      titles.push(title);
    }
  }

  return titles.slice(0, 5); // top 5 headlines
}
