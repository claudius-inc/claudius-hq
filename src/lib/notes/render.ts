/**
 * RENDER — StructuredFacts → Telegram HTML push + web body.
 * See docs/daily-note-spec.md §2 (escaping, 4096 cap), §4 (section order).
 *
 * Slice 1 is deterministic-only (no LLM prose yet): a factual hook + THE TAPE +
 * RATES + CROSS-ASSET + sector tape. WHAT MATTERS / BULL-BEAR / BOOK / TELLS
 * arrive with slices 2 and 4. Sections whose fact is null are omitted (§1a).
 */
import type {
  StructuredFacts,
  IndexPoint,
  RatesData,
  VixData,
  CrossAssetPoint,
  SectorPoint,
  BreadthData,
} from "@/lib/notes/types";

const NBSP = " ";

/** Escape every text node before wrapping in tags (§2). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape for use inside a double-quoted HTML attribute (adds `"`). */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

const code = (s: string | number) => `<code>${escapeHtml(String(s))}</code>`;
const b = (s: string) => `<b>${escapeHtml(s)}</b>`;

function arrow(pct: number): string {
  return pct > 0 ? "▲" : pct < 0 ? "▼" : "·";
}
/** Directional "▲0.2%" / "▼1.8%". */
function dpct(pct: number): string {
  return `${arrow(pct)}${Math.abs(pct).toFixed(1)}%`;
}
/** Signed "+0.2%" / "-1.8%" for contexts without an arrow. */
function spct(pct: number, dp = 1): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(dp)}%`;
}
const intFmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ── Section builders (return "" when the fact is absent) ─────────────────────

function hookLine(f: StructuredFacts): string {
  const sp = f.indices?.value.find((i) => i.symbol === "^GSPC");
  const parts: string[] = [];
  if (sp) parts.push(`S&P ${intFmt(sp.close)} ${dpct(sp.changePct)}`);
  const br = f.breadth?.value;
  if (br) parts.push(`breadth ${intFmt(br.advances)}/${intFmt(br.declines)}`);
  const vx = f.vix?.value;
  if (vx) parts.push(`VIX ${vx.level.toFixed(1)}`);
  // Plain-readable, no leading emoji, ≤120 chars (§2). Escape — the hook is
  // plain text (no tags) and contains "&" via "S&P".
  const raw = parts.join(" · ") || `Daily tape — ${f.date}`;
  const line = raw.length <= 120 ? raw : raw.slice(0, 117) + "…";
  return escapeHtml(line);
}

function tapeSection(f: StructuredFacts): string {
  if (!f.indices) return "";
  const sp = f.indices.value.find((i) => i.symbol === "^GSPC");
  const dot = sp ? (sp.changePct >= 0 ? "🟢" : "🔴") : "🔵";
  const lines: string[] = [`${dot} ${b("THE TAPE")}`];

  const idx = (p: IndexPoint) =>
    p.symbol === "^GSPC"
      ? `${escapeHtml("S&P")} ${code(intFmt(p.close))} ${dpct(p.changePct)}`
      : `${escapeHtml(p.name)} ${dpct(p.changePct)}`;
  lines.push(f.indices.value.map(idx).join(" · "));

  const br: BreadthData | undefined = f.breadth?.value;
  if (br) {
    lines.push(
      `Breadth (NYSE): ${code(intFmt(br.advances))} up / ${code(intFmt(br.declines))} down · A/D ${code(br.ratio.toFixed(2))} · new H/L ${code(`${br.newHighs} / ${br.newLows}`)}`,
    );
  }

  const vx: VixData | undefined = f.vix?.value;
  if (vx) {
    const chg = `${vx.change >= 0 ? "+" : ""}${vx.change.toFixed(1)}`;
    const trend = vx.trendDays > 0 && vx.trendDir !== "flat" ? `, ${vx.trendDir} ${vx.trendDays}d` : "";
    lines.push(
      `VIX ${code(vx.level.toFixed(1))} ${chg} — ~${vx.percentile}th %ile of YTD ${code(`${vx.ytdLow.toFixed(1)}–${vx.ytdHigh.toFixed(1)}`)}${trend}`,
    );
  }
  return lines.join("\n");
}

function ratesSection(f: StructuredFacts): string {
  if (!f.rates) return "";
  const r: RatesData = f.rates.value;
  const bp = (n: number) => `${n >= 0 ? "+" : ""}${n}bp`;
  const emoji = r.chg10Bp >= 0 ? "📈" : "📉";
  const l1 = `${emoji} ${b("RATES")} — 2Y ${code(r.y2.toFixed(2) + "%")} ${bp(r.chg2Bp)} · 10Y ${code(r.y10.toFixed(2) + "%")} ${bp(r.chg10Bp)} · 30Y ${code(r.y30.toFixed(2) + "%")} ${bp(r.chg30Bp)}`;
  const l2 = `2s10s ${code(bp(r.spread2s10Bp))} (${bp(r.spread2s10ChgBp)} on the day)`;
  return `${l1}\n${l2}`;
}

function crossPrice(p: CrossAssetPoint): string {
  const v = p.price;
  let num: string;
  if (p.label === "BTC") num = `$${Math.round(v / 1000)}k`;
  else if (p.label === "Gold" || p.label === "Crude") num = `$${intFmt(v)}`;
  else num = v.toFixed(1); // DXY
  const chg = p.changePct != null ? ` ${dpct(p.changePct)}` : "";
  return `${escapeHtml(p.label)} ${code(num)}${chg}`;
}

function sectorTape(s: SectorPoint[]): string {
  const sorted = [...s].sort((a, b) => b.changePct - a.changePct);
  const up = sorted.slice(0, 2).filter((x) => x.changePct > 0);
  const down = sorted.slice(-2).reverse().filter((x) => x.changePct < 0);
  const fmt = (x: SectorPoint) => `${escapeHtml(x.name)} ${spct(x.changePct)}`;
  const parts: string[] = [];
  if (up.length) parts.push(`▲ ${up.map(fmt).join(", ")}`);
  if (down.length) parts.push(`▼ ${down.map(fmt).join(", ")}`);
  return parts.length ? `Sectors ${parts.join(" · ")}` : "";
}

function crossSection(f: StructuredFacts): string {
  const lines: string[] = [];
  if (f.crossAsset) {
    lines.push(`🧭 ${b("CROSS-ASSET")} — ${f.crossAsset.value.map(crossPrice).join(" · ")}`);
  }
  if (f.sectors) {
    const tape = sectorTape(f.sectors.value);
    if (tape) lines.push(tape);
  }
  return lines.join("\n");
}

function footer(webUrl: string): string {
  const notAdvice = escapeHtml("Not advice.");
  // Telegram rejects a relative href with a 400; only link when absolute.
  if (!/^https?:\/\//i.test(webUrl)) return notAdvice;
  return `${notAdvice}${NBSP} <a href="${escapeAttr(webUrl)}">Full note →</a>`;
}

export interface RenderInput {
  facts: StructuredFacts;
  webUrl: string;
}

/** Telegram HTML push. Asserts ≤4096 UTF-16 units (§2). */
export function renderPush({ facts, webUrl }: RenderInput): string {
  const blocks = [
    hookLine(facts),
    tapeSection(facts),
    ratesSection(facts),
    crossSection(facts),
    footer(webUrl),
  ].filter((s) => s.length > 0);

  const html = blocks.join("\n\n");
  if (html.length > 4096) {
    // Slice-1 content is short; a real overflow means a data anomaly — surface it.
    throw new Error(`Rendered push exceeds 4096 chars (${html.length})`);
  }
  return html;
}

/** Web body (HTML) mirroring the push; the archive page renders this. */
export function renderWeb({ facts, webUrl }: RenderInput): string {
  const push = renderPush({ facts, webUrl });
  // Slice 1: the web body is the push content as HTML paragraphs. Slices 3–4
  // add the full sector board, divergence, and spotlight deep-dives here.
  return push
    .split("\n\n")
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}
