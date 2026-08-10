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
import type { WeeklyReview } from "@/lib/notes/weekly-review";

const b = (s: string) => `<b>${escapeHtml(s)}</b>`;
const spct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

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

/**
 * THE WEEK REVIEWED — the wrap's only backward-looking section (§C).
 *
 * `detail = false` is the ladder's degraded form: the summary counts survive,
 * the per-item breakdown goes. The counts are what carry the accountability, so
 * they are the last thing to be dropped, not the first.
 *
 * Every line prints its denominator, and no line carries a scoring verb. The
 * pin was never a prediction and the quoted hook was never a bet; the section
 * juxtaposes and stops.
 */
function reviewSection(r: WeeklyReview | null, detail = true): string {
  if (!r) return "";
  const lines: string[] = [];

  if (r.followThrough) {
    const ft = r.followThrough;
    // "checkable" is stated whenever it differs from what was flagged — a flag
    // made on the last session has no window, and hiding that would quietly
    // shrink the denominator to whatever happened to resolve.
    const scope = ft.checkable === ft.flagged ? "" : ` (of ${ft.flagged} flagged)`;
    lines.push(
      ft.checkable === 0
        ? // Every flag unresolved. Saying so beats letting the line disappear,
          // which would present a data outage as a quiet week.
          `${b("Divergence follow-through")} — none of ${ft.flagged} flag${ft.flagged === 1 ? "" : "s"} could be checked this week`
        : `${b("Divergence follow-through")} — ${ft.kept} of ${ft.checkable} checkable flags${scope} kept their direction against their sector`,
    );
    if (detail) {
      for (const n of ft.names.slice(0, 3)) {
        lines.push(
          `${escapeHtml(n.ticker)} flagged ${escapeHtml(shortDate(n.flaggedOn))}: ${spct(n.namePct)} vs ${escapeHtml(n.sectorEtf)} ${spct(n.sectorPct)} — ${n.kept ? "held" : "faded"}`,
        );
      }
    }
  }

  if (r.pin) {
    const scope = r.pin.checkable === r.pin.total ? "" : ` (of ${r.pin.total} overnights)`;
    lines.push(
      `${b("Pin distance")} — the next close landed within ${r.pin.nearPct}% of the prior session's pin on ` +
        `${r.pin.near} of ${r.pin.checkable}${scope}`,
    );
  }

  if (r.biggestMoves) {
    const bm = r.biggestMoves;
    const scope =
      bm.sessionsCovered === bm.totalSessions ? "" : ` (across ${bm.sessionsCovered} of ${bm.totalSessions} sessions)`;
    lines.push(
      `${b("Biggest single days")}${escapeHtml(scope)} — ` +
        bm.names
          .map((n) => `${escapeHtml(n.ticker)} ${spct(n.changePct)} ${escapeHtml(shortDate(n.date))}`)
          .join(" · ") +
        escapeHtml(" — among the names the notes surfaced"),
    );
  }

  if (r.concentration) {
    const c = r.concentration;
    const bits = [`${c.reconciledSessions} of ${c.totalSessions} sessions reconciled`];
    if (c.flipDays > 0) {
      bits.push(`the index held its direction only on its top names on ${c.flipDays} of them`);
    }
    if (detail && c.recurring.length > 0) {
      bits.push(c.recurring.map((x) => `${x.ticker} on ${x.days}`).join(", "));
    }
    lines.push(`${b("Concentration")} — ${escapeHtml(bits.join("; "))}`);
  }

  if (r.vixRegime) {
    const v = r.vixRegime;
    // The basis is disclosed: the percentile is of THIS YEAR's closes as ranked
    // on each day, so the distribution shifts slightly week to week.
    const crossing =
      v.crossed.length > 0
        ? `crossed the ${v.crossed.map((p) => `${p}th`).join(" and ")} percentile ${v.direction}`
        : `no percentile band crossed`;
    lines.push(
      `${b("Volatility regime")} — ${escapeHtml(`${v.startPercentile}th to ${v.endPercentile}th percentile of this year's closes; ${crossing}`)}`,
    );
  }

  if (detail && r.quoted) {
    // Juxtaposition, never a verdict. "WE WROTE" and the outcome sit next to
    // each other and the reader draws their own conclusion.
    lines.push(`${b("We wrote")} ${escapeHtml(shortDate(r.quoted.date))} — ${escapeHtml(`"${r.quoted.hook}"`)}`);
  }

  if (lines.length === 0) return "";
  return `${b("THE WEEK REVIEWED")}\n${lines.join("\n")}`;
}

interface WeeklyTrim {
  /** Drop the per-item breakdown inside THE WEEK REVIEWED, keep its counts. */
  reviewDetail?: boolean;
  /** Cap on the sector / cross-asset / index move lists. */
  maxMoves?: number;
  /** Drop the rotation line — the softest of the descriptive sections. */
  showRotation?: boolean;
  /** Drop THE WEEK REVIEWED entirely. Last resort: it is why the wrap exists. */
  showReview?: boolean;
}

function build(f: WeeklyFacts, webUrl: string, t: WeeklyTrim = {}): string {
  const { reviewDetail = true, maxMoves = 4, showRotation = true, showReview = true } = t;
  const blocks: string[] = [hook(f), `${b("THE WEEK")} — ${escapeHtml(prettySpan(f))}`];

  const idx = movesLine("Indices", f.indices, maxMoves);
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

  const cross = movesLine("Cross-asset", f.crossAsset, maxMoves);
  if (cross) blocks.push(cross);

  if (showRotation && f.rotation) {
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

  // THE WEEK REVIEWED sits after the descriptive sections and before the link:
  // it is the part the reader came for, so it is late enough to be read against
  // the week's numbers and early enough not to be mistaken for a footnote.
  if (showReview) {
    const review = reviewSection(f.review, reviewDetail);
    if (review) blocks.push(review);
  }

  if (/^https?:\/\//i.test(webUrl)) blocks.push(`<a href="${escapeHtml(webUrl)}">Full wrap</a>`);

  return blocks.filter((s) => s.length > 0).join("\n\n");
}

/**
 * Every rung of the weekly overflow ladder, longest first.
 *
 * This replaced a `blocks.slice(0, 6)` fallback, which cut whatever happened to
 * sit past position six — with the review section added that would have silently
 * discarded the accountability content and kept the sector tape. The order below
 * is a priority statement: the review's summary counts outlive every descriptive
 * section, because a wrap without them is just the week restated.
 *
 * Exported for the same reason as the daily `pushLadder`: so a test can assert
 * the sequence never grows. An omitted flag defaults back to ON, which is how
 * the daily ladder was broken twice.
 */
export function weeklyLadder(f: WeeklyFacts, webUrl: string): string[] {
  const rungs: WeeklyTrim[] = [
    {},
    // The review's per-item breakdown, and the quoted hook with it.
    { reviewDetail: false },
    // Then breadth of the descriptive lists.
    { reviewDetail: false, maxMoves: 3 },
    { reviewDetail: false, maxMoves: 2 },
    // Then the softest descriptive section.
    { reviewDetail: false, maxMoves: 2, showRotation: false },
    // Only now the review itself, and only because a sent wrap beats no wrap.
    { reviewDetail: false, maxMoves: 2, showRotation: false, showReview: false },
  ];
  return rungs.map((t) => build(f, webUrl, t));
}

export function renderWeeklyPush(f: WeeklyFacts, webUrl: string): string {
  const CAP = 4096;
  const rungs = weeklyLadder(f, webUrl);
  for (const rendered of rungs) {
    if (rendered.length <= CAP) return rendered;
  }
  const last = rungs[rungs.length - 1] ?? "";
  throw new Error(`Weekly wrap exceeds ${CAP} chars even stripped (${last.length})`);
}

export function renderWeeklyWeb(f: WeeklyFacts, webUrl: string): string {
  // The web page has no 4096 cap, so render the FULL wrap rather than whichever
  // rung the push happened to settle on.
  const push = build(f, webUrl);
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
    webFollowThrough(f),
    webPin(f),
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

/**
 * Every flag, not just the three the push has room for — including the ones
 * that faded. The push's cap is a space constraint; letting it also decide which
 * outcomes get shown would turn a cap into selective narration.
 */
function webFollowThrough(f: WeeklyFacts): string {
  const ft = f.review?.followThrough;
  if (!ft) return "";
  const rows = ft.names
    .map(
      (n) =>
        `<li><code>${escapeHtml(n.ticker)}</code> flagged ${escapeHtml(n.flaggedOn)} at ${spct(n.gapAtFlag)} vs sector — since: ` +
        `${spct(n.namePct)} vs <code>${escapeHtml(n.sectorEtf)}</code> ${spct(n.sectorPct)} · <b>${n.kept ? "held" : "faded"}</b></li>`,
    )
    .join("\n");
  const unresolved = ft.flagged - ft.checkable;
  const caveat =
    unresolved > 0
      ? `<p>${unresolved} further flag${unresolved === 1 ? " was" : "s were"} not checkable — flagged on the closing session, or the bars disagreed.</p>`
      : "";
  return `<h2>Divergence follow-through</h2>\n<p>${ft.kept} of ${ft.checkable} kept their direction against their sector.</p>\n<ul>\n${rows}\n</ul>\n${caveat}`;
}

/** Pin distance per overnight — arithmetic, stated as such, with no verdict. */
function webPin(f: WeeklyFacts): string {
  const pin = f.review?.pin;
  if (!pin) return "";
  const rows = pin.overnights
    .map(
      (o) =>
        `<li>Pinned ${escapeHtml(o.pinnedOn)} at ${o.pinStrike} — next close ${o.nextClose}, ${spct(o.distancePct)} away</li>`,
    )
    .join("\n");
  return (
    `<h2>Pin distance</h2>\n<p>The pin is derived from start-of-day open interest and was never a forecast; ` +
    `this is the distance the next close landed from it.</p>\n<ul>\n${rows}\n</ul>`
  );
}
