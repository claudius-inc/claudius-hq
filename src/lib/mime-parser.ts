/**
 * Lightweight MIME parser for incoming emails.
 * Extracts clean text/plain and text/html parts from multipart MIME bodies,
 * decodes quoted-printable encoding, and handles base64 text parts.
 */

/** Decode quoted-printable encoded string */
export function decodeQuotedPrintable(input: string): string {
  return input
    // Soft line breaks (= at end of line → continuation)
    .replace(/=\r?\n/g, "")
    // Encoded bytes (=XX hex pairs)
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/** Decode base64 string to UTF-8 text */
function decodeBase64(input: string): string {
  try {
    return Buffer.from(input.trim(), "base64").toString("utf-8");
  } catch {
    return input;
  }
}

/** Check if a body looks like multipart MIME content */
export function isMultipartMime(body: string): boolean {
  return /^--[\w.=+-]+\r?\n/m.test(body) || /Content-Type:\s*multipart\//i.test(body);
}

interface MimePart {
  contentType: string;
  encoding: string;
  body: string;
}

/** Parse multipart MIME body into individual parts */
function parseMimeParts(body: string): MimePart[] {
  // Find boundary — try Content-Type header first, then first boundary line
  let boundary: string | null = null;

  const ctMatch = body.match(/Content-Type:\s*multipart\/\w+;\s*boundary="?([^"\r\n;]+)"?/i);
  if (ctMatch) {
    boundary = ctMatch[1];
  } else {
    // Look for the first line that starts with --
    const lineMatch = body.match(/^(--[\w.=+-]+)\r?\n/m);
    if (lineMatch) {
      boundary = lineMatch[1].slice(2); // Remove leading --
    }
  }

  if (!boundary) return [];

  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);
  const parts: MimePart[] = [];

  for (const segment of segments) {
    // Skip preamble and closing delimiter
    if (!segment.trim() || segment.trim() === "--") continue;

    // Split headers from body (blank line separates them)
    const headerBodySplit = segment.match(/\r?\n\r?\n/);
    if (!headerBodySplit) continue;

    const splitIndex = segment.indexOf(headerBodySplit[0]);
    const headerSection = segment.slice(0, splitIndex);
    let partBody = segment.slice(splitIndex + headerBodySplit[0].length);

    // Trim trailing whitespace/newlines
    partBody = partBody.replace(/\r?\n$/, "");

    // Extract content type and encoding from headers
    const typeMatch = headerSection.match(/Content-Type:\s*([^;\r\n]+)/i);
    const encodingMatch = headerSection.match(/Content-Transfer-Encoding:\s*(\S+)/i);

    const contentType = typeMatch ? typeMatch[1].trim().toLowerCase() : "text/plain";
    const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : "7bit";

    // If this is a nested multipart, recurse
    if (contentType.startsWith("multipart/")) {
      const nested = parseMimeParts(segment);
      parts.push(...nested);
      continue;
    }

    // Decode body based on encoding
    if (encoding === "quoted-printable") {
      partBody = decodeQuotedPrintable(partBody);
    } else if (encoding === "base64") {
      partBody = decodeBase64(partBody);
    }

    parts.push({ contentType, encoding, body: partBody });
  }

  return parts;
}

/** Strip HTML tags and decode common entities for a plain-text fallback */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/?(li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ParsedEmail {
  text: string;
  html: string;
}

/** Parse raw email body, extracting clean text and HTML */
export function parseEmailBody(rawText: string, rawHtml: string): ParsedEmail {
  // Try parsing the text field as MIME (workers often put raw MIME here)
  const mimeSource = rawText || rawHtml || "";

  if (isMultipartMime(mimeSource)) {
    const parts = parseMimeParts(mimeSource);

    const textPart = parts.find((p) => p.contentType === "text/plain");
    const htmlPart = parts.find((p) => p.contentType === "text/html");

    const cleanText = textPart?.body || (htmlPart ? stripHtml(htmlPart.body) : "");
    const cleanHtml = htmlPart?.body || "";

    return { text: cleanText.trim(), html: cleanHtml.trim() };
  }

  // Not multipart — still might have QP encoding artifacts
  let text = rawText || "";
  let html = rawHtml || "";

  // If text looks QP-encoded (contains =XX patterns heavily), decode it
  if (/=[0-9A-Fa-f]{2}/.test(text) && (text.includes("=3D") || text.includes("=\n"))) {
    text = decodeQuotedPrintable(text);
  }
  if (/=[0-9A-Fa-f]{2}/.test(html) && (html.includes("=3D") || html.includes("=\n"))) {
    html = decodeQuotedPrintable(html);
  }

  // Detect raw HTML stored as text (no multipart, but body is HTML)
  const trimmedText = text.trim();
  if (!html && trimmedText.match(/^<!DOCTYPE\s|^<html[\s>]/i)) {
    html = trimmedText;
    text = stripHtml(trimmedText);
  }

  return { text: text.trim(), html: html.trim() };
}

/** Validate and clean from_address field */
export function sanitizeFromAddress(from: string): string {
  if (!from) return "unknown@unknown";

  // Check if the local part (before @) looks like a raw message/session ID
  // Pattern: long hex-dash strings like 0100019c1dec67b8-9d75b1bd-a9b0-4530-...
  const atIndex = from.indexOf("@");
  if (atIndex > 0) {
    const localPart = from.slice(0, atIndex);
    if (/^[0-9a-f]{6,}-[0-9a-f-]+$/i.test(localPart) && localPart.length > 20) {
      // Extract the domain for context
      const domain = from.slice(atIndex + 1);
      return `${domain} <${from}>`;
    }
    return from;
  }

  // No @ at all — likely a raw message ID
  if (/^[0-9a-f-]{20,}$/i.test(from)) {
    return `unknown-sender <${from}@unknown>`;
  }

  return from;
}
