import { NextRequest, NextResponse } from "next/server";
import { db, stockReports } from "@/db";

interface SearchResult {
  id: number;
  ticker: string;
  title: string;
  company_name: string | null;
  report_type: string;
  created_at: string | null;
  relevance_score: number;
  snippet: string;
}

// Tokenize text into lowercase words, removing punctuation
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2); // Skip very short words
}

// Calculate term frequency for a document
function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}

// Calculate TF-IDF score for query against document
function calculateRelevance(
  queryTokens: string[],
  docTokens: string[],
  docFreq: Map<string, number>,
  totalDocs: number
): number {
  const tf = termFrequency(docTokens);
  let score = 0;

  for (const queryToken of queryTokens) {
    const termCount = tf.get(queryToken) || 0;
    if (termCount > 0) {
      // TF: log(1 + count)
      const tfScore = Math.log(1 + termCount);
      // IDF: log(totalDocs / (1 + docsWithTerm))
      const docsWithTerm = docFreq.get(queryToken) || 0;
      const idfScore = Math.log(totalDocs / (1 + docsWithTerm));
      score += tfScore * idfScore;
    }
  }

  // Bonus for title/ticker matches
  return score;
}

// Extract a relevant snippet around the query terms
function extractSnippet(content: string, queryTokens: string[], maxLength: number = 200): string {
  const lowerContent = content.toLowerCase();
  let bestStart = 0;
  let bestScore = 0;

  // Find the position with most query terms nearby
  for (let i = 0; i < content.length - 50; i += 50) {
    const window = lowerContent.slice(i, i + maxLength);
    let score = 0;
    for (const token of queryTokens) {
      if (window.includes(token)) {
        score += 1;
        // Bonus for exact word match
        if (new RegExp(`\\b${token}\\b`).test(window)) {
          score += 0.5;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // Extract snippet and clean it up
  let snippet = content.slice(bestStart, bestStart + maxLength);
  
  // Try to start at a sentence/paragraph boundary
  const sentenceStart = snippet.indexOf(". ");
  if (sentenceStart > 0 && sentenceStart < 50) {
    snippet = snippet.slice(sentenceStart + 2);
  }

  // Clean markdown formatting
  snippet = snippet
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();

  // Truncate at word boundary
  if (snippet.length > maxLength) {
    const lastSpace = snippet.lastIndexOf(" ", maxLength);
    snippet = snippet.slice(0, lastSpace > 0 ? lastSpace : maxLength);
  }

  return snippet + "...";
}

// POST /api/stocks/search — search stock reports
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Query must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Fetch all reports
    const reports = await db
      .select({
        id: stockReports.id,
        ticker: stockReports.ticker,
        title: stockReports.title,
        companyName: stockReports.companyName,
        content: stockReports.content,
        reportType: stockReports.reportType,
        createdAt: stockReports.createdAt,
      })
      .from(stockReports);

    if (reports.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Tokenize query
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Calculate document frequency for IDF
    const docFreq = new Map<string, number>();
    const reportTokens: Map<number, string[]> = new Map();

    for (const report of reports) {
      const combinedText = `${report.ticker} ${report.title || ""} ${report.companyName || ""} ${report.content}`;
      const tokens = tokenize(combinedText);
      reportTokens.set(report.id, tokens);

      // Count unique terms per document
      const uniqueTerms = Array.from(new Set(tokens));
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    // Score each report
    const scoredReports: { report: typeof reports[0]; score: number }[] = [];

    for (const report of reports) {
      const tokens = reportTokens.get(report.id) || [];
      let score = calculateRelevance(queryTokens, tokens, docFreq, reports.length);

      // Boost for ticker/title/company name matches
      const tickerLower = report.ticker.toLowerCase();
      const titleLower = (report.title || "").toLowerCase();
      const companyLower = (report.companyName || "").toLowerCase();

      for (const qToken of queryTokens) {
        if (tickerLower === qToken || tickerLower.includes(qToken)) {
          score += 10; // Strong boost for ticker match
        }
        if (titleLower.includes(qToken)) {
          score += 3; // Moderate boost for title match
        }
        if (companyLower.includes(qToken)) {
          score += 5; // Good boost for company name match
        }
      }

      if (score > 0) {
        scoredReports.push({ report, score });
      }
    }

    // Sort by score descending
    scoredReports.sort((a, b) => b.score - a.score);

    // Take top 10 and format results
    const results: SearchResult[] = scoredReports.slice(0, 10).map(({ report, score }) => ({
      id: report.id,
      ticker: report.ticker,
      title: report.title,
      company_name: report.companyName,
      report_type: report.reportType,
      created_at: report.createdAt,
      relevance_score: Math.round(score * 100) / 100,
      snippet: extractSnippet(report.content, queryTokens),
    }));

    return NextResponse.json({ results });
  } catch (e) {
    console.error("Search error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
