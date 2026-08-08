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
  NoteProse,
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

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 23 → "23rd". */
function ordinal(n: number): string {
  const v = Math.round(n);
  const rem100 = v % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1: return `${v}st`;
    case 2: return `${v}nd`;
    case 3: return `${v}rd`;
    default: return `${v}th`;
  }
}

// ── Section builders (return "" when the fact is absent) ─────────────────────

/** Facts-only fallback hook (plain text, unescaped) — §8.3 hook-never-drop. */
export function deterministicHook(f: StructuredFacts): string {
  const sp = f.indices?.value.find((i) => i.symbol === "^GSPC");
  const parts: string[] = [];
  if (sp) parts.push(`S&P ${intFmt(sp.close)} ${dpct(sp.changePct)}`);
  const br = f.breadth?.value;
  if (br) parts.push(`breadth ${intFmt(br.advances)}/${intFmt(br.declines)}`);
  const vx = f.vix?.value;
  if (vx) parts.push(`VIX ${vx.level.toFixed(1)}`);
  return parts.join(" · ") || `Daily tape — ${f.date}`;
}

/** Escaped, ≤120-char hook line: validated LLM hook if present, else fallback. */
function hookLine(f: StructuredFacts, prose?: NoteProse): string {
  // Plain-readable, no leading emoji, ≤120 chars (§2). Escape — the hook is
  // plain text (no tags) and contains "&" via "S&P".
  const raw = prose?.hook || deterministicHook(f);
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
      `VIX ${code(vx.level.toFixed(1))} ${chg} — ~${ordinal(vx.percentile)} %ile of YTD ${code(`${vx.ytdLow.toFixed(1)}–${vx.ytdHigh.toFixed(1)}`)}${trend}`,
    );
  }
  return lines.join("\n");
}

function ratesSection(f: StructuredFacts, prose?: NoteProse): string {
  if (!f.rates) return "";
  const r: RatesData = f.rates.value;
  const bp = (n: number) => `${n >= 0 ? "+" : ""}${n}bp`;
  const emoji = r.chg10Bp >= 0 ? "📈" : "📉";
  const l1 = `${emoji} ${b("RATES")} — 2Y ${code(r.y2.toFixed(2) + "%")} ${bp(r.chg2Bp)} · 10Y ${code(r.y10.toFixed(2) + "%")} ${bp(r.chg10Bp)} · 30Y ${code(r.y30.toFixed(2) + "%")} ${bp(r.chg30Bp)}`;
  const l2 = prose?.curveRead
    ? escapeHtml(prose.curveRead)
    : `2s10s ${code(bp(r.spread2s10Bp))} (${bp(r.spread2s10ChgBp)} on the day)`;
  return `${l1}\n${l2}`;
}

/**
 * The sharpest within-sector divergence, as a deterministic one-liner (§5).
 * Ships the tell even when prose is unavailable; the LLM gets the same facts.
 */
function divergenceSection(f: StructuredFacts): string {
  const top = f.divergence?.value[0];
  if (!top) return "";
  const names = top.names
    .map((n) => `${escapeHtml(n.ticker)} ${spct(n.changePct)}`)
    .join(", ");
  const verb = top.direction === "down" ? "green in a red" : "red in a green";
  return `🔀 ${b("DIVERGENCE")} — ${escapeHtml(top.sectorName)} ${spct(top.sectorChangePct)}, but ${names} closed ${verb} sector`;
}

function whatMattersSection(prose?: NoteProse): string {
  if (!prose?.whatMatters?.length) return "";
  const bullets = prose.whatMatters.map((x) => `• ${escapeHtml(x)}`).join("\n");
  return `🔑 ${b("WHAT MATTERS")}\n${bullets}`;
}

function bullBearSection(prose?: NoteProse): string {
  if (!prose?.bull && !prose?.bear) return "";
  const lines: string[] = [`⚖️ ${b("BULL / BEAR")}`];
  if (prose.bull) lines.push(`${b("Bull:")} ${escapeHtml(prose.bull)}`);
  if (prose.bear) lines.push(`${b("Bear:")} ${escapeHtml(prose.bear)}`);
  return lines.join("\n");
}

function bookSection(prose?: NoteProse): string {
  if (!prose?.book) return "";
  return `📖 ${b("THE BOOK")} — ${escapeHtml(prose.book)}`;
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
  /** LLM prose (slice 2). Absent → deterministic note (slice-1 behavior). */
  prose?: NoteProse;
}

function build(facts: StructuredFacts, webUrl: string, prose?: NoteProse): string {
  return [
    hookLine(facts, prose),
    tapeSection(facts),
    ratesSection(facts, prose),
    crossSection(facts),
    divergenceSection(facts),
    whatMattersSection(prose),
    bullBearSection(prose),
    bookSection(prose),
    footer(webUrl),
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/**
 * Telegram HTML push, ≤4096 UTF-16 units (§2). On overflow, degrade the prose
 * in priority order (drop book → bull/bear → trim What-Matters from the end →
 * prose-free deterministic note) rather than throwing. Only a prose-free note
 * that STILL overflows is a true data anomaly worth throwing on.
 */
export function renderPush({ facts, webUrl, prose }: RenderInput): string {
  const CAP = 4096;

  const candidates: (NoteProse | undefined)[] = [];
  if (prose) {
    candidates.push(prose);
    candidates.push({ ...prose, book: undefined });
    candidates.push({ ...prose, book: undefined, bull: undefined, bear: undefined });
    // Trim What-Matters bullets from the end.
    for (let n = prose.whatMatters.length - 1; n >= 0; n--) {
      candidates.push({ ...prose, book: undefined, bull: undefined, bear: undefined, whatMatters: prose.whatMatters.slice(0, n) });
    }
  }
  candidates.push(undefined); // deterministic, prose-free

  let last = "";
  for (const p of candidates) {
    last = build(facts, webUrl, p);
    if (last.length <= CAP) return last;
  }
  throw new Error(`Rendered push exceeds ${CAP} chars even prose-free (${last.length}) — data anomaly`);
}

/** Full 11-sector board, biggest first (web only — §7.3). */
function webSectorBoard(f: StructuredFacts): string {
  if (!f.sectors) return "";
  const rows = [...f.sectors.value]
    .sort((a, b) => b.changePct - a.changePct)
    .map((s) => `<li>${escapeHtml(s.name)} <code>${escapeHtml(s.etf)}</code> — ${spct(s.changePct)}</li>`)
    .join("\n");
  return `<h2>Sector board</h2>\n<ul>\n${rows}\n</ul>`;
}

/** Every qualifying sector's divergence, not just the sharpest (§7.4). */
function webDivergence(f: StructuredFacts): string {
  if (!f.divergence) return "";
  const blocks = f.divergence.value
    .map((d) => {
      const names = d.names
        .map(
          (n) =>
            `<li><code>${escapeHtml(n.ticker)}</code>${n.name ? ` ${escapeHtml(n.name)}` : ""} ${spct(n.changePct)} <i>(${spct(n.gap)} vs sector)</i></li>`,
        )
        .join("\n");
      return `<h3>${escapeHtml(d.sectorName)} ${spct(d.sectorChangePct)}</h3>\n<ul>\n${names}\n</ul>`;
    })
    .join("\n");
  return `<h2>Within-sector divergence</h2>\n${blocks}`;
}

/** Index concentration detail (§7.2 support for the contribution claim). */
function webContribution(f: StructuredFacts): string {
  const c = f.contribution?.value;
  if (!c) return "";
  return (
    `<h2>Index concentration</h2>\n<p>Top movers ${c.topNames.map((t) => `<code>${escapeHtml(t)}</code>`).join(", ")} ` +
    `contributed ${spct(c.topPoints)} of the index's ${spct(c.actualPct)}. Excluding them: ${spct(c.exTopPct)}` +
    `${c.flipsWithoutTop ? " — <b>the index only held its direction on those names</b>" : ""}.</p>`
  );
}

/** Web body (HTML); the archive page renders this. */
export function renderWeb({ facts, webUrl, prose }: RenderInput): string {
  // The web page has no 4096 cap, so render the FULL prose (build directly)
  // rather than the possibly-trimmed push.
  const push = build(facts, webUrl, prose);
  const head = push
    .split("\n\n")
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  // Depth sections the push has no room for. Spotlight deep-dives land in slice 4.
  return [head, webSectorBoard(facts), webDivergence(facts), webContribution(facts)]
    .filter((s) => s.length > 0)
    .join("\n");
}
