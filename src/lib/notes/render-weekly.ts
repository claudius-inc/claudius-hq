/**
 * Render the weekly wrap — see docs/daily-note-v2-spec.md §C.
 *
 * Same conventions as the daily note: escape every text node before tagging,
 * signed percentages rather than arrow glyphs, run-in bold labels, no emoji,
 * one Telegram message under the 4096 cap.
 *
 * The section is titled THE WEEK REVIEWED, not "scorecard". The wrap reports
 * what happened and what the daily notes flagged; it never grades the balanced
 * bull/bear box, which is symmetric by construction and so cannot be scored
 * without dressing a coin flip as skill.
 */
import { escapeHtml } from "@/lib/notes/render";
import type { WeeklyFacts, WeeklyMove } from "@/lib/notes/weekly";

const b = (s: string) => `<b>${escapeHtml(s)}</b>`;
const spct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function prettySpan(f: WeeklyFacts): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  // The span is stated from the anchor session, so a reader can always see what
  // period the numbers actually cover — a short week says so.
  return `${fmt(f.weekStart)} to ${fmt(f.weekEnd)}, ${f.sessions} session${f.sessions === 1 ? "" : "s"}`;
}

function movesLine(label: string, moves: WeeklyMove[], max = 4): string {
  if (moves.length === 0) return "";
  const items = moves.slice(0, max).map((m) => `${escapeHtml(m.label)} ${spct(m.changePct)}`);
  return `${b(label)} — ${items.join(" · ")}`;
}

function hook(f: WeeklyFacts): string {
  const sp = f.indices.find((i) => i.label.startsWith("S&P"));
  const parts: string[] = [];
  if (sp) parts.push(`S&P ${spct(sp.changePct)} on the week`);
  if (f.breadth && f.breadth.negativeSessions > f.breadth.sessionsCovered / 2) {
    parts.push(`breadth negative ${f.breadth.negativeSessions} of ${f.breadth.sessionsCovered}`);
  }
  if (f.rotation?.rotated) parts.push(`leadership rotated to ${f.rotation.secondHalfLeader}`);
  const line = parts.join(" · ") || `Week to ${f.weekEnd}`;
  return escapeHtml(line.length <= 120 ? line : line.slice(0, 117) + "…");
}

export function renderWeeklyPush(f: WeeklyFacts, webUrl: string): string {
  const blocks: string[] = [hook(f), `${b("THE WEEK")} — ${escapeHtml(prettySpan(f))}`];

  const idx = movesLine("Indices", f.indices);
  if (idx) blocks.push(idx);

  if (f.rates) {
    const bp = (n: number) => `${n >= 0 ? "+" : ""}${n}bp`;
    blocks.push(
      `${b("Rates")} — ${f.rates.map((r) => `${escapeHtml(r.label)} ${bp(r.changeBp)}`).join(" · ")}`,
    );
  }

  if (f.vix) {
    blocks.push(`${b("VIX")} — ${f.vix.end.toFixed(1)} from ${f.vix.start.toFixed(1)}`);
  }

  const leaders = f.sectors.slice(0, 2);
  const laggards = f.sectors.slice(-2).reverse();
  if (leaders.length) {
    const lines = [`${b("Sectors")} — led by ${leaders.map((s) => `${escapeHtml(s.label)} ${spct(s.changePct)}`).join(", ")}`];
    if (laggards.length) lines.push(`lagged by ${laggards.map((s) => `${escapeHtml(s.label)} ${spct(s.changePct)}`).join(", ")}`);
    blocks.push(lines.join("\n"));
  }

  const cross = movesLine("Cross-asset", f.crossAsset);
  if (cross) blocks.push(cross);

  if (f.rotation) {
    blocks.push(
      f.rotation.rotated
        ? `${b("Rotation")} — leadership passed from ${escapeHtml(f.rotation.firstHalfLeader)} to ${escapeHtml(f.rotation.secondHalfLeader)} mid-week`
        : `${b("Rotation")} — ${escapeHtml(f.rotation.firstHalfLeader)} led throughout; no hand-off`,
    );
  }

  if (f.breadth) {
    // The denominator is always stated: a trend claim over three reported days
    // is not the same claim as one over five.
    const net = f.breadth.cumulativeNet;
    blocks.push(
      `${b("Breadth")} — negative on ${f.breadth.negativeSessions} of ${f.breadth.sessionsCovered} reported ` +
        `session${f.breadth.sessionsCovered === 1 ? "" : "s"}; cumulative net ${net >= 0 ? "+" : ""}${net.toLocaleString("en-US")} issues`,
    );
  }

  if (/^https?:\/\//i.test(webUrl)) blocks.push(`<a href="${escapeHtml(webUrl)}">Full wrap</a>`);

  const html = blocks.filter((s) => s.length > 0).join("\n\n");
  if (html.length > 4096) {
    // The weekly has no prose to shed, so trim the softest sections instead of
    // failing the send.
    const trimmed = blocks.slice(0, 6).join("\n\n");
    if (trimmed.length <= 4096) return trimmed;
    throw new Error(`Weekly wrap exceeds 4096 chars (${html.length})`);
  }
  return html;
}

export function renderWeeklyWeb(f: WeeklyFacts, webUrl: string): string {
  const push = renderWeeklyPush(f, webUrl);
  const board =
    f.sectors.length > 0
      ? `<h2>Sector board</h2>\n<ul>\n${f.sectors
          .map((s) => `<li>${escapeHtml(s.label)} — ${spct(s.changePct)}</li>`)
          .join("\n")}\n</ul>`
      : "";
  return [
    push
      .split("\n\n")
      .map((blk) => `<p>${blk.replace(/\n/g, "<br/>")}</p>`)
      .join("\n"),
    board,
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
