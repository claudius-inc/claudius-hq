import type { Metadata } from "next";
import Link from "next/link";
import YahooFinance from "yahoo-finance2";
import { eq, desc } from "drizzle-orm";
import {
  db,
  rawClient,
  scannerUniverse,
  tickerMetrics,
  tags as tagsTable,
  tickerTags,
  themes,
  themeStocks,
  portfolioHoldings,
  tradeJournal,
} from "@/db";
import type { StockReport } from "@/lib/types";
import { logger } from "@/lib/logger";
import { TickerHeader } from "./_components/TickerHeader";
import { TickerThemesTags } from "./_components/TickerThemesTags";
import { TickerScores } from "./_components/TickerScores";
import { TickerHoldings } from "./_components/TickerHoldings";
import { TickerNews, type NewsItem } from "./_components/TickerNews";
import { TickerResearch } from "./_components/TickerResearch";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface PageProps {
  params: { ticker: string };
  searchParams: { report?: string };
}

interface QuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketChange?: number;
  regularMarketPreviousClose?: number;
  fullExchangeName?: string;
  exchange?: string;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  try {
    const row = await db
      .select({
        name: scannerUniverse.name,
        ticker: scannerUniverse.ticker,
      })
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1);
    if (row[0]?.name) {
      return { title: `${row[0].ticker} – ${row[0].name}` };
    }
  } catch {}
  return { title: `${ticker} – Ticker` };
}

async function loadQuote(ticker: string): Promise<QuoteResult | null> {
  try {
    const result = (await yahooFinance.quote(ticker)) as
      | QuoteResult
      | QuoteResult[];
    return Array.isArray(result) ? result[0] || null : result || null;
  } catch {
    return null;
  }
}

async function loadNews(ticker: string): Promise<NewsItem[]> {
  try {
    const result = (await yahooFinance.search(ticker, {
      newsCount: 8,
      quotesCount: 0,
    })) as { news?: NewsItem[] };
    return Array.isArray(result.news) ? result.news.slice(0, 8) : [];
  } catch {
    return [];
  }
}

interface ReportRow {
  id: number;
  ticker: string;
  slug: string | null;
  title: string;
  content: string;
  report_type: string;
  company_name: string | null;
  related_tickers: string | null;
  created_at: string;
}

async function loadReports(
  tickerOrSlug: string,
  selectedReportId: number | null,
): Promise<{ current: StockReport | null; older: ReportRow[] }> {
  // ticker lookups are case-insensitive (UPPER), thematic slugs are kebab-case
  // so we pass the raw param for the slug match alongside the uppercased ticker.
  const upper = tickerOrSlug.toUpperCase();
  try {
    let current: ReportRow | null = null;
    if (selectedReportId) {
      const r = await rawClient.execute({
        sql: "SELECT * FROM stock_reports WHERE id = ? AND (UPPER(ticker) = ? OR slug = ?)",
        args: [selectedReportId, upper, tickerOrSlug],
      });
      current = (r.rows[0] as unknown as ReportRow) || null;
    }
    if (!current) {
      const r = await rawClient.execute({
        sql: "SELECT * FROM stock_reports WHERE UPPER(ticker) = ? OR slug = ? ORDER BY created_at DESC LIMIT 1",
        args: [upper, tickerOrSlug],
      });
      current = (r.rows[0] as unknown as ReportRow) || null;
    }

    let older: ReportRow[] = [];
    if (current) {
      const r = await rawClient.execute({
        sql: "SELECT id, ticker, slug, title, content, report_type, company_name, related_tickers, created_at FROM stock_reports WHERE (UPPER(ticker) = ? OR slug = ?) AND id != ? ORDER BY created_at DESC",
        args: [upper, tickerOrSlug, current.id],
      });
      older = r.rows as unknown as ReportRow[];
    }

    return { current: current as unknown as StockReport, older };
  } catch (e) {
    logger.error("ticker-page", "Failed to load reports", { error: e, tickerOrSlug });
    return { current: null, older: [] };
  }
}

export default async function TickerPage({ params, searchParams }: PageProps) {
  const rawSlug = decodeURIComponent(params.ticker);
  const ticker = rawSlug.toUpperCase();
  const selectedReportId = searchParams.report
    ? parseInt(searchParams.report, 10) || null
    : null;

  const [
    universeRow,
    metricsRow,
    tagRows,
    themeLinks,
    holdingRow,
    journalRows,
    quote,
    news,
    reports,
  ] = await Promise.all([
    db
      .select()
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1)
      .then((rows) => rows[0] || null),
    db
      .select()
      .from(tickerMetrics)
      .where(eq(tickerMetrics.ticker, ticker))
      .limit(1)
      .then((rows) => rows[0] || null),
    db
      .select({ name: tagsTable.name })
      .from(tickerTags)
      .innerJoin(tagsTable, eq(tagsTable.id, tickerTags.tagId))
      .where(eq(tickerTags.ticker, ticker)),
    db
      .select({
        themeId: themes.id,
        name: themes.name,
        status: themeStocks.status,
        targetPrice: themeStocks.targetPrice,
      })
      .from(themeStocks)
      .innerJoin(themes, eq(themes.id, themeStocks.themeId))
      .where(eq(themeStocks.ticker, ticker)),
    db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.ticker, ticker))
      .limit(1)
      .then((rows) => rows[0] || null),
    db
      .select()
      .from(tradeJournal)
      .where(eq(tradeJournal.ticker, ticker))
      .orderBy(desc(tradeJournal.date))
      .limit(5),
    loadQuote(ticker),
    loadNews(ticker),
    loadReports(rawSlug, selectedReportId),
  ]);

  const tagNames = tagRows.map((t) => t.name);

  const displayName =
    quote?.shortName ||
    quote?.longName ||
    universeRow?.name ||
    null;

  const market = universeRow?.market || null;
  const sector = universeRow?.sector || null;

  const exists =
    !!universeRow ||
    !!metricsRow ||
    tagRows.length > 0 ||
    themeLinks.length > 0 ||
    !!quote;

  return (
    <>
      <div className="sticky top-12 z-30 bg-gray-50 border-b border-gray-200 md:border-b-0 -mx-4 px-4">
        <div className="max-w-6xl mx-auto py-2 md:py-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link
              href="/markets/scanner/stocks"
              className="hover:text-gray-600 transition-colors"
            >
              Stocks
            </Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">{ticker}</span>
            {market && (
              <span className="ml-1 px-1.5 py-px text-[10px] rounded border bg-white text-gray-500 border-gray-200">
                {market}
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-10 space-y-6">
        <TickerHeader
          ticker={ticker}
          name={displayName}
          sector={sector}
          quote={quote}
          metrics={metricsRow}
        />

        <TickerThemesTags
          themes={themeLinks.map((t) => ({
            id: t.themeId,
            name: t.name,
            status: t.status,
            targetPrice: t.targetPrice,
          }))}
          tags={tagNames}
        />

        {metricsRow && (
          <TickerScores
            metrics={metricsRow}
            description={universeRow?.notes || null}
          />
        )}

        {(holdingRow || journalRows.length > 0) && (
          <TickerHoldings
            ticker={ticker}
            holding={holdingRow}
            currentPrice={quote?.regularMarketPrice ?? metricsRow?.price ?? null}
            journal={journalRows}
          />
        )}

        <TickerNews news={news} ticker={ticker} />

        <TickerResearch
          ticker={ticker}
          companyName={displayName}
          current={reports.current}
          older={reports.older}
        />

        {!exists && !reports.current && (
          <div className="text-center text-sm text-gray-400 pt-2">
            No watchlist or theme data for {ticker} yet. Add it from the{" "}
            <Link
              href="/markets/scanner/stocks"
              className="text-emerald-600 underline"
            >
              Stocks Watchlist
            </Link>{" "}
            page.
          </div>
        )}
      </main>
    </>
  );
}
