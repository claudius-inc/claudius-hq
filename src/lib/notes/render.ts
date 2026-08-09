/**
 * RENDER — StructuredFacts → Telegram HTML push + web body.
 * See docs/daily-note-spec.md §2 (escaping, 4096 cap), §4 (section order).
 *
 * Slice 1 is deterministic-only (no LLM prose yet): a factual hook + THE TAPE +
 * RATES + CROSS-ASSET + sector tape. WHAT MATTERS / BULL-BEAR / BOOK / TELLS
 * arrive with slices 2 and 4. Sections whose fact is null are omitted (§1a).
 */
import { extractNumerals } from "@/lib/notes/validate";
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

/** Monospace. Web-only: in the push it buys no column alignment and widens lines. */
const code = (s: string | number) => `<code>${escapeHtml(String(s))}</code>`;
const b = (s: string) => `<b>${escapeHtml(s)}</b>`;

/**
 * Direction is signed text, never ▲/▼. Those glyphs are missing from the mobile
 * UI font and get substituted per platform — the same defect as emoji — and the
 * LLM writes "+1.5%" regardless, so signs keep prose and template consistent.
 */
function spct(pct: number, dp = 1): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(dp)}%`;
}
const intFmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * After-hours annotation for a named ticker (§G). Always clocked from the print
 * itself, never from send time, so the claim stays true when a re-run edits the
 * message. Returns "" when the ticker has no qualifying extended move.
 */
function ahSuffix(f: StructuredFacts, ticker: string): string {
  const pm = f.postMarket?.value.find((m) => m.ticker === ticker);
  if (!pm) return "";
  return escapeHtml(` (${spct(pm.changePct)} after hours as of ${pm.asOfEt} ET)`);
}

/** Non-breaking space, so a wrap never splits a label from its number. */
const NB = " ";
/** Bind a label to its value: "Gold␣$4,403". */
const bind = (label: string, value: string) => `${escapeHtml(label)}${NB}${value}`;

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

/**
 * Claim ledger — the fix for the note's worst readability defect.
 *
 * Sections are generated independently, so the same fact was printing up to
 * three times (VIX in THE TAPE, BULL and THE BOOK; the concentration numbers in
 * both WHAT MATTERS and BEAR). A quarter of the message was content the reader
 * had already read, which teaches them to skip the half where the thinking is.
 *
 * Rule: a prose line survives only if it introduces at least one number not yet
 * printed. Deterministic sections render first and therefore own their facts.
 * Restating a number IN WORDS stays legal — "nearly two to one" is
 * interpretation, "1,808 vs 951" is a rerun — and a digit-based check allows
 * that for free.
 */
function makeLedger() {
  // Exact match on a 2dp key, NOT a tolerance. A tolerance collides among the
  // many small percentages in a market note — "+0.26%" reads as already-seen
  // against a "+0.3%" printed elsewhere, and the ledger then eats the whole
  // WHAT MATTERS section. The fact sheet hands the model canonically formatted
  // numbers, so a genuine restatement is character-identical anyway.
  const emitted = new Set<number>();
  const key = (v: number) => Math.round(v * 100) / 100;
  const seen = (v: number) => emitted.has(key(v));
  return {
    /** Record every numeral in a line that is being printed. */
    claim(text: string) {
      for (const n of extractNumerals(text)) emitted.add(key(n.value));
    },
    /** True when the line adds nothing numerically new (so it should be cut). */
    isRedundant(text: string): boolean {
      const ns = extractNumerals(text);
      // A line with no numbers is pure interpretation — always keep it.
      if (ns.length === 0) return false;
      return ns.every((n) => seen(n.value));
    },
  };
}
type Ledger = ReturnType<typeof makeLedger>;

// ── Section builders (return "" when the fact is absent) ─────────────────────

/** Facts-only fallback hook (plain text, unescaped) — §8.3 hook-never-drop. */
export function deterministicHook(f: StructuredFacts): string {
  const sp = f.indices?.value.find((i) => i.symbol === "^GSPC");
  const parts: string[] = [];
  if (sp) parts.push(`S&P ${intFmt(sp.close)} ${spct(sp.changePct)}`);
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
  
  // Run-in label: one header idiom across the note gives the left margin a
  // rhythm, which is the whole scanning mechanism without colour or size.
  const idx = (p: IndexPoint) =>
    p.symbol === "^GSPC"
      ? bind("S&P", `${intFmt(p.close)} ${spct(p.changePct)}`)
      : bind(p.name, spct(p.changePct));
  const lines: string[] = [`${b("THE TAPE")} — ${f.indices.value.map(idx).join(" · ")}`];

  const br: BreadthData | undefined = f.breadth?.value;
  if (br) {
    lines.push(
      `Breadth ${intFmt(br.advances)} up / ${intFmt(br.declines)} down · A/D ${br.ratio.toFixed(2)} · new highs ${br.newHighs}, lows ${br.newLows}`,
    );
  }

  const vx: VixData | undefined = f.vix?.value;
  if (vx) {
    const chg = `${vx.change >= 0 ? "+" : ""}${vx.change.toFixed(1)}`;
    const trend = vx.trendDays > 0 && vx.trendDir !== "flat" ? `, ${vx.trendDir} ${vx.trendDays} days` : "";
    lines.push(
      `VIX ${vx.level.toFixed(1)}, ${chg} — ${ordinal(vx.percentile)} percentile of this year's ${vx.ytdLow.toFixed(1)}–${vx.ytdHigh.toFixed(1)} range${trend}`,
    );
  }
  return lines.join("\n");
}

/**
 * Where the day sits in its recent run (§D). Deliberately "5-session" and
 * "21-session", never "1 week" and "1 month" — a holiday week would make those
 * labels false. Omitted when the split-defect gate dropped both figures.
 */
function trendSection(f: StructuredFacts): string {
  const tf = f.timeframes?.value;
  if (!tf) return "";
  const sp = tf.find((t) => t.symbol === "^GSPC");
  if (!sp || (sp.chg5s == null && sp.chg21s == null)) return "";

  const parts: string[] = [];
  if (sp.chg5s != null) parts.push(`5-session ${spct(sp.chg5s)}`);
  if (sp.chg21s != null) parts.push(`21-session ${spct(sp.chg21s)}`);

  // The strongest and weakest sector over 21 sessions puts the day in context.
  const sectors = tf.filter((t) => t.symbol.startsWith("XL") && t.chg21s != null);
  let lead = "";
  if (sectors.length >= 2) {
    const sorted = [...sectors].sort((a, b) => (b.chg21s as number) - (a.chg21s as number));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    lead = ` · over 21 sessions ${escapeHtml(best.symbol)} leads ${spct(best.chg21s as number)}, ${escapeHtml(worst.symbol)} lags ${spct(worst.chg21s as number)}`;
  }
  return `${b("TREND")} — ${escapeHtml("S&P")} ${parts.join(" · ")}${lead}`;
}

/**
 * Economic releases that printed today (§E), measured against the PRIOR.
 *
 * The basis is stated in the label, not buried: no free feed carries consensus,
 * so calling a gap versus the prior a "consensus miss" would be untrue. When the
 * prior has since been revised, say so — a revision is often larger than the
 * surprise being reported.
 *
 * `detail = false` is the degraded form for the overflow ladder: the figures
 * survive, the framing goes.
 */
function macroSection(f: StructuredFacts, detail = true): string {
  const rel = f.macro?.value;
  if (!rel?.length) return "";
  const fmt = (v: number, r: { dp: number; suffix: string }) =>
    `${v >= 0 && r.suffix !== "%" ? "+" : ""}${v.toFixed(r.dp)}${r.suffix}`;
  const items = rel.map((r) => {
    const revised = detail && r.priorRevised ? " revised" : "";
    return `${escapeHtml(r.label)} ${fmt(r.actual, r)} vs ${fmt(r.prior, r)} prior${revised}`;
  });
  const basis = detail ? " (vs prior — no consensus feed)" : "";
  return `${b("DATA")}${escapeHtml(basis)} — ${items.join(" · ")}`;
}

function ratesSection(f: StructuredFacts, prose?: NoteProse): string {
  if (!f.rates) return "";
  const r: RatesData = f.rates.value;
  const bp = (n: number) => `${n >= 0 ? "+" : ""}${n}bp`;
  
  const l1 = `${b("RATES")} — ${bind("2Y", `${r.y2.toFixed(2)}% ${bp(r.chg2Bp)}`)} · ${bind("10Y", `${r.y10.toFixed(2)}% ${bp(r.chg10Bp)}`)} · ${bind("30Y", `${r.y30.toFixed(2)}% ${bp(r.chg30Bp)}`)}`;
  const l2 = prose?.curveRead
    ? escapeHtml(prose.curveRead)
    : `2s10s ${bp(r.spread2s10Bp)} (${bp(r.spread2s10ChgBp)} on the day)`;
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
    .map((n) => `${escapeHtml(n.ticker)} ${spct(n.changePct)}${ahSuffix(f, n.ticker)}`)
    .join(", ");
  const verb = top.direction === "down" ? "green in a red" : "red in a green";
  return `${b("DIVERGENCE")} — ${escapeHtml(top.sectorName)} ${spct(top.sectorChangePct)}, but ${names} closed ${verb} sector`;
}

/**
 * Claim-first bullets. The model writes "Short claim. Evidence.", so bolding
 * the first sentence gives every item a lead the eye can catch — a 4-row
 * unbroken bullet is a grey wall exactly where the reasoning lives. The bold
 * lead also replaces the "•" marker, which at reading size was hard to tell
 * apart from the "·" used as an inline separator.
 */
function whatMattersSection(prose: NoteProse | undefined, ledger: Ledger): string {
  const items = (prose?.whatMatters ?? []).filter((x) => !ledger.isRedundant(x)).slice(0, 3);
  if (items.length === 0) return "";
  const lines = items.map((x) => {
    ledger.claim(x);
    // [\s\S] instead of the `s` flag — the build targets pre-ES2018.
    const m = x.match(/^([\s\S]{0,60}?[.!?])\s+([\s\S]+)$/);
    return m ? `${b(m[1])} ${escapeHtml(m[2])}` : escapeHtml(x);
  });
  return `${b("WHAT MATTERS")}\n${lines.join("\n")}`;
}

/** Bull and bear each get their own run-in label, on the same rail as the rest. */
function bullBearSection(prose: NoteProse | undefined, ledger: Ledger): string {
  const lines: string[] = [];
  for (const [label, text] of [
    ["BULL", prose?.bull],
    ["BEAR", prose?.bear],
  ] as const) {
    if (!text || ledger.isRedundant(text)) continue;
    ledger.claim(text);
    lines.push(`${b(label)} — ${escapeHtml(text)}`);
  }
  return lines.join("\n\n");
}

/** One line per spotlighted sector, after CROSS-ASSET (§6). */
function spotlightSection(f: StructuredFacts, max = Infinity): string {
  if (!f.spotlight || max <= 0) return "";
  return f.spotlight.value
    .slice(0, max)
    .map((s) => {
      // The sector's own % already printed in the sector tape, so the callout
      // stays purely additive — constituents only, which is its actual job.
      const head = b(s.label);
      const bits: string[] = [];
      if (s.price != null) bits.push(`$${intFmt(s.price)}`);
      if (s.leaders.length)
        bits.push(
          `leaders ${s.leaders.map((n) => `${escapeHtml(n.ticker)} ${spct(n.changePct)}${ahSuffix(f, n.ticker)}`).join(", ")}`,
        );
      if (s.laggards.length)
        bits.push(
          `laggard ${s.laggards.map((n) => `${escapeHtml(n.ticker)} ${spct(n.changePct)}${ahSuffix(f, n.ticker)}`).join(", ")}`,
        );
      if (s.proxy) bits.push(`${escapeHtml(s.proxy.ticker)} ${spct(s.proxy.changePct)}${ahSuffix(f, s.proxy.ticker)}`);
      return bits.length ? `${head} — ${bits.join("; ")}` : head;
    })
    .join("\n");
}

/**
 * THE BOOK: the gamma pin is a fact, so it renders deterministically; the LLM's
 * positioning line is appended when it survived validation. Omitted entirely
 * when there's neither (§1 "cut quiet sections").
 */
function bookSection(f: StructuredFacts, prose: NoteProse | undefined, ledger: Ledger): string {
  const pin = f.gexPin?.value;
  const parts: string[] = [];
  if (pin) {
    const stance = pin.netGammaPositive ? "dealers long gamma" : "dealers short gamma";
    parts.push(
      `${stance}, pin near ${intFmt(pin.pinStrike)} on ${escapeHtml(pin.symbol)}, ${spct(pin.distancePct)} away`,
    );
  }
  // The gamma stance is numeral-free, so the validator can't catch an LLM line
  // that states the opposite. Drop a book line that contradicts the fact.
  const contradictsStance =
    pin != null &&
    prose?.book != null &&
    new RegExp(pin.netGammaPositive ? "short gamma" : "long gamma", "i").test(prose.book);
  // The pin line above already states stance + strike, and the model tends to
  // restate it verbatim. A book line that repeats the strike or the stance adds
  // nothing, so keep only genuinely additive colour.
  const restatesPin =
    pin != null &&
    prose?.book != null &&
    (prose.book.includes(String(pin.pinStrike)) || /\bgamma\b/i.test(prose.book));
  const bookOk =
    prose?.book && !contradictsStance && !restatesPin && !ledger.isRedundant(prose.book);
  if (bookOk && prose?.book) {
    ledger.claim(prose.book);
    parts.push(escapeHtml(prose.book));
  }
  if (parts.length === 0) return "";
  // "·" separates peers of the same type only; two clauses get a line break.
  return `${b("THE BOOK")} — ${parts.join("\n")}`;
}

/** Next-session catalysts: econ releases with ET times (§4.9). */
function tellsSection(f: StructuredFacts): string {
  const events = f.econEvents?.value;
  if (!events?.length) return "";
  // Label is next-trading-day dynamic; derive it from the first event's date.
  const label = new Date(`${events[0].date}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
    .toUpperCase();
  const items = events.map((e) => {
    const consensus = e.consensus != null ? ` (cons. ${e.consensus})` : "";
    // The window spans several days, so anything not on the header's day must
    // carry its own weekday — otherwise Wednesday's CPI reads as Monday's.
    const day =
      e.date === events[0].date
        ? ""
        : new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }) + " ";
    return `${escapeHtml(e.name)} ${escapeHtml(day)}${e.timeEt}${NB}ET${escapeHtml(consensus)}`;
  });
  return `${b(`${label}'S TELLS`)} — ${items.join(" · ")}`;
}

function crossPrice(p: CrossAssetPoint): string {
  const v = p.price;
  let num: string;
  if (p.label === "BTC") num = `$${Math.round(v / 1000)}k`;
  else if (p.label === "Gold" || p.label === "Crude") num = `$${intFmt(v)}`;
  else num = v.toFixed(1); // DXY
  const chg = p.changePct != null ? ` ${spct(p.changePct)}` : "";
  return `${bind(p.label, num)}${chg}`;
}

function sectorTape(s: SectorPoint[]): string {
  const sorted = [...s].sort((a, b) => b.changePct - a.changePct);
  const up = sorted.slice(0, 2).filter((x) => x.changePct > 0);
  const down = sorted.slice(-2).reverse().filter((x) => x.changePct < 0);
  const fmt = (x: SectorPoint) => bind(x.name, spct(x.changePct));
  // Words, not ▲/▼ markers: the arrows substitute across platforms and this
  // splits one long line into two short ones.
  const lines: string[] = [];
  if (up.length) lines.push(`Sector leaders ${up.map(fmt).join(", ")}`);
  if (down.length) lines.push(`Sector laggards ${down.map(fmt).join(", ")}`);
  return lines.join("\n");
}

function crossSection(f: StructuredFacts): string {
  const lines: string[] = [];
  if (f.crossAsset) {
    lines.push(`${b("CROSS-ASSET")} — ${f.crossAsset.value.map(crossPrice).join(" · ")}`);
  }
  if (f.sectors) {
    const tape = sectorTape(f.sectors.value);
    if (tape) lines.push(tape);
  }
  return lines.join("\n");
}

function footer(webUrl: string): string {
  // Telegram rejects a relative href with a 400; only link when absolute.
  if (!/^https?:\/\//i.test(webUrl)) return "";
  return `<a href="${escapeAttr(webUrl)}">Full note</a>`;
}

export interface RenderInput {
  facts: StructuredFacts;
  webUrl: string;
  /** LLM prose (slice 2). Absent → deterministic note (slice-1 behavior). */
  prose?: NoteProse;
}

function build(
  facts: StructuredFacts,
  webUrl: string,
  prose?: NoteProse,
  maxSpotlight = Infinity,
  showAfterHours = true,
  macroDetail = true,
): string {
  // After-hours suffixes are ornament, not argument. Stripping them is the
  // cheapest thing the overflow ladder can do, so it happens before any of the
  // note's reasoning is touched.
  if (!showAfterHours) facts = { ...facts, postMarket: null };
  // The ledger is filled by the deterministic sections FIRST, so they own their
  // facts and any prose line that merely restates them is dropped.
  const ledger = makeLedger();
  const hook = hookLine(facts, prose);
  const tape = tapeSection(facts);
  const trend = trendSection(facts);
  const macro = macroSection(facts, macroDetail);
  const rates = ratesSection(facts, prose);
  const cross = crossSection(facts);
  const spot = spotlightSection(facts, maxSpotlight);
  const diverge = divergenceSection(facts);
  for (const s of [hook, tape, trend, macro, rates, cross, spot, diverge]) ledger.claim(s);

  return [
    hook,
    tape,
    trend,
    macro,
    rates,
    cross,
    spot,
    diverge,
    whatMattersSection(prose, ledger),
    bullBearSection(prose, ledger),
    bookSection(facts, prose, ledger),
    tellsSection(facts),
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

  const candidates: { prose?: NoteProse; maxSpotlight?: number; showAfterHours?: boolean; macroDetail?: boolean }[] = [];
  if (prose) {
    candidates.push({ prose });
    // Drop the after-hours ornament BEFORE any reasoning. Appending this rung
    // after the prose ladder would strip the note's whole voice while decorative
    // "(+2.1% after hours)" suffixes survived.
    candidates.push({ prose, showAfterHours: false });
    // Macro figures survive; only their framing goes.
    candidates.push({ prose, showAfterHours: false, macroDetail: false });
    candidates.push({ prose: { ...prose, book: undefined }, showAfterHours: false });
    candidates.push({ prose: { ...prose, book: undefined, bull: undefined, bear: undefined }, showAfterHours: false });
    // Trim What-Matters bullets from the end.
    for (let n = prose.whatMatters.length - 1; n >= 0; n--) {
      // Keep the ornament OFF here. Omitting these flags let them default back
      // to true, so after-hours suffixes and macro framing were re-added exactly
      // as bullets started being cut — inverting the rule and making the ladder
      // non-monotonic, so a later rung could be longer than an earlier one.
      candidates.push({
        prose: { ...prose, book: undefined, bull: undefined, bear: undefined, whatMatters: prose.whatMatters.slice(0, n) },
        showAfterHours: false,
        macroDetail: false,
      });
    }
  }
  candidates.push({ showAfterHours: false }); // deterministic, prose-free
  // Last resort before throwing: the user can spotlight all 12 sectors, so trim
  // those callouts too rather than failing the send.
  const spotlightCount = facts.spotlight?.value.length ?? 0;
  for (let n = spotlightCount - 1; n >= 0; n--) candidates.push({ maxSpotlight: n, showAfterHours: false });

  let last = "";
  for (const c of candidates) {
    last = build(facts, webUrl, c.prose, c.maxSpotlight, c.showAfterHours ?? true, c.macroDetail ?? true);
    if (last.length <= CAP) return last;
  }
  throw new Error(`Rendered push exceeds ${CAP} chars even stripped (${last.length}) — data anomaly`);
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

/** Spotlight deep-dive blocks (§6, web only). */
function webSpotlight(f: StructuredFacts): string {
  if (!f.spotlight) return "";
  const blocks = f.spotlight.value
    .map((s) => {
      const rows: string[] = [];
      if (s.price != null) rows.push(`<li>Price <code>$${escapeHtml(intFmt(s.price))}</code></li>`);
      for (const n of s.leaders)
        rows.push(`<li>Leader <code>${escapeHtml(n.ticker)}</code> ${spct(n.changePct)}</li>`);
      for (const n of s.laggards)
        rows.push(`<li>Laggard <code>${escapeHtml(n.ticker)}</code> ${spct(n.changePct)}</li>`);
      if (s.proxy)
        rows.push(`<li>Proxy <code>${escapeHtml(s.proxy.ticker)}</code> ${spct(s.proxy.changePct)}</li>`);
      const head = `${escapeHtml(s.label)}${s.headlinePct != null ? ` ${spct(s.headlinePct)}` : ""}`;
      return `<h3>${head}</h3>\n<ul>\n${rows.join("\n")}\n</ul>`;
    })
    .join("\n");
  return `<h2>Spotlight</h2>\n${blocks}`;
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

  // Depth sections the push has no room for.
  return [head, webSectorBoard(facts), webDivergence(facts), webContribution(facts), webSpotlight(facts)]
    .filter((s) => s.length > 0)
    .join("\n");
}
