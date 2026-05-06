/**
 * POST /api/acp/url-reader
 *
 * Fetches a URL and returns a clean LLM-ready structured payload: title,
 * byline, published date, plain text or markdown body, links, og:image.
 * Built for content/research agent pipelines that need a primitive "give me
 * the article body" call.
 *
 * Strategy: server-side fetch → linkedom DOM → @mozilla/readability article
 * extract → turndown to markdown. JS-rendered SPAs are NOT supported in this
 * v1 (we'd need a headless browser); the deliverable returns
 * `wasReadable: false` if Readability couldn't extract a meaningful article.
 *
 * `linkedom` is used instead of `jsdom` because jsdom pulls native deps
 * (canvas) that fail to bundle on Vercel's serverless runtime. linkedom is
 * pure-JS, ~10x smaller, and Readability-compatible.
 *
 * Safety:
 *   - Blocks fetches against private IP ranges (SSRF).
 *   - Caps response size at 5MB before parsing.
 *   - Caps output `markdown`/`text` at `maxChars` (default 8000).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { logger } from "@/lib/logger";
import { formatZodError } from "@/lib/acp/acp-schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

const BodySchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), { message: "must be http(s)" }),
  format: z.enum(["markdown", "text", "json"]).default("markdown"),
  includeLinks: z.boolean().default(true),
  maxChars: z.number().int().min(200).max(50_000).default(8000),
});

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  // IPv4 private/loopback ranges
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  // IPv6 loopback / link-local / unique-local
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

interface ExtractResult {
  title: string | null;
  byline: string | null;
  publishedAt: string | null;
  lang: string | null;
  ogImage: string | null;
  contentHtml: string;
  contentText: string;
  excerpt: string | null;
  wasReadable: boolean;
}

function extractMeta(doc: Document): {
  publishedAt: string | null;
  ogImage: string | null;
  lang: string | null;
} {
  const meta = (sel: string) =>
    doc.querySelector(sel)?.getAttribute("content")?.trim() || null;
  const publishedAt =
    meta('meta[property="article:published_time"]') ||
    meta('meta[name="article:published_time"]') ||
    meta('meta[name="pubdate"]') ||
    meta('meta[name="date"]') ||
    meta('meta[name="DC.date.issued"]') ||
    doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
    null;
  const ogImage =
    meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
  const lang = doc.documentElement.getAttribute("lang") || null;
  return { publishedAt, ogImage, lang };
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let parsed;
  try {
    const raw = await req.json();
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid body: ${formatZodError(result.error)}` },
        { status: 400 }
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(parsed.url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (isPrivateOrLocalHost(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Refusing to fetch private / loopback host" },
      { status: 400 }
    );
  }

  let response: Response;
  let body: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(parsed.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClaudiusInc-URLReader/1.0; +https://claudiusinc.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en;q=0.9,*;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${response.status}` },
        { status: 502 }
      );
    }
    const ct = response.headers.get("content-type") || "";
    if (!/html|xml/i.test(ct)) {
      return NextResponse.json(
        { error: `Unsupported content-type: ${ct}` },
        { status: 415 }
      );
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Response exceeds ${MAX_BYTES} bytes` },
        { status: 413 }
      );
    }
    body = buf.toString("utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("url-reader", `Fetch failed: ${msg}`, { url: parsed.url });
    return NextResponse.json(
      { error: `Fetch failed: ${msg}` },
      { status: 502 }
    );
  }

  let extract: ExtractResult;
  try {
    const { document: doc } = parseHTML(body);
    const meta = extractMeta(doc as unknown as Document);
    // Readability mutates the document; parse a separate copy for safety
    const { document: readDoc } = parseHTML(body);
    const reader = new Readability(readDoc as unknown as Document);
    const article = reader.parse();
    if (article && article.content && (article.textContent?.length ?? 0) > 200) {
      extract = {
        title: article.title || null,
        byline: article.byline || null,
        publishedAt: meta.publishedAt,
        lang: meta.lang || article.lang || null,
        ogImage: meta.ogImage,
        contentHtml: article.content,
        contentText: article.textContent || "",
        excerpt: article.excerpt || null,
        wasReadable: true,
      };
    } else {
      // Fallback: title + body text, no extraction
      extract = {
        title: doc.querySelector("title")?.textContent?.trim() || null,
        byline: null,
        publishedAt: meta.publishedAt,
        lang: meta.lang,
        ogImage: meta.ogImage,
        contentHtml: doc.body?.innerHTML ?? "",
        contentText: doc.body?.textContent ?? "",
        excerpt: null,
        wasReadable: false,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("url-reader", `Parse failed: ${msg}`, { url: parsed.url });
    return NextResponse.json(
      { error: `Parse failed: ${msg}` },
      { status: 500 }
    );
  }

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  let markdown = "";
  if (parsed.format !== "text") {
    try {
      markdown = td.turndown(extract.contentHtml);
    } catch {
      markdown = extract.contentText;
    }
  }
  const cleanText = extract.contentText.replace(/\s+/g, " ").trim();

  let links: Array<{ href: string; text: string }> = [];
  if (parsed.includeLinks) {
    try {
      const { document: doc } = parseHTML(extract.contentHtml);
      const seen = new Set<string>();
      doc.querySelectorAll("a[href]").forEach((a: Element) => {
        const href = a.getAttribute("href") || "";
        const text = (a.textContent || "").trim();
        if (!href || !/^https?:/i.test(href)) return;
        if (seen.has(href)) return;
        seen.add(href);
        links.push({ href, text: clip(text, 200) });
      });
      links = links.slice(0, 100);
    } catch {
      links = [];
    }
  }

  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  return NextResponse.json({
    url: parsed.url,
    finalUrl: response.url,
    title: extract.title,
    byline: extract.byline,
    publishedAt: extract.publishedAt,
    lang: extract.lang,
    ogImage: extract.ogImage,
    excerpt: extract.excerpt,
    wasReadable: extract.wasReadable,
    format: parsed.format,
    markdown: parsed.format === "markdown" ? clip(markdown, parsed.maxChars) : "",
    text:
      parsed.format === "text" || parsed.format === "json"
        ? clip(cleanText, parsed.maxChars)
        : "",
    wordCount,
    links: parsed.includeLinks ? links : [],
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  });
}
