/**
 * RENDER — StructuredFacts → Telegram HTML push + web body.
 * See docs/daily-note-spec.md §2 (escaping, 4096 cap), §4 (section order).
 *
 * Slice 1 is deterministic-only (no LLM prose yet): a factual hook + THE TAPE +
 * RATES + CROSS-ASSET + sector tape. WHAT MATTERS / BULL-BEAR / BOOK / TELLS
 * arrive with slices 2 and 4. Sections whose fact is null are omitted (§1a).
 */
import { extractNumerals } from "@/lib/notes/validate";
import { gammaStance, stanceWord, pinNoun } from "@/lib/notes/gamma-stance";
import { SECTOR_SPDRS } from "@/lib/notes/sources/spdr-holdings";
import { toYahooSymbol } from "@/lib/notes/sources/daily-bars";
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
 * A mover with no retrieved reason needs its own floor before it earns a line.
 * Same threshold the attribution gate uses (notes/attribution.ts MIN_ABS_MOVE),
 * so the two halves of MOVERS agree on what counts as a move.
 */
const BARE_MOVER_FLOOR_PCT = 1.5;

/** The 11 sector SPDRs, for telling a sector apart from a constituent. */
const SECTOR_SPDR_SET = new Set<string>(SECTOR_SPDRS);

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
    // A one-session "run" is just the day's change, which this same line already
    // prints as `chg` — so a trend needs at least two sessions before it is
    // worth a clause. "sessions", not "days", matches the deliberate
    // 5-session/21-session convention in trendSection below.
    const trend =
      vx.trendDays >= 2 && vx.trendDir !== "flat" ? `, ${vx.trendDir} ${vx.trendDays} sessions` : "";
    // `percentile` is a RANK (share of closes below `level`), not a position in
    // the low–high range — see VixData. "8th percentile of the range" invited
    // the reader to compute 8% of the way from the low to the high, which is a
    // different and much weaker number.
    lines.push(
      `VIX ${vx.level.toFixed(1)}, ${chg} — below ${100 - vx.percentile}% of this year's closes (range ${vx.ytdLow.toFixed(1)}–${vx.ytdHigh.toFixed(1)})${trend}`,
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
  // Exact membership, not a "XL" prefix: the timeframes fact now also carries
  // the relevance union's single names, and a constituent whose ticker happens
  // to start with XL would otherwise be ranked as a sector.
  const sectors = tf.filter((t) => SECTOR_SPDR_SET.has(t.symbol) && t.chg21s != null);
  let lead = "";
  if (sectors.length >= 2) {
    const sorted = [...sectors].sort((a, b) => (b.chg21s as number) - (a.chg21s as number));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    // Name the sector, not just its ETF. The sector tape a few lines down says
    // "Energy", so printing "XLE" here asks the reader to hold the eleven-SPDR
    // mapping in their head to connect two lines of the same note.
    const byEtf = new Map((f.sectors?.value ?? []).map((s) => [s.etf, s.name]));
    const named = (symbol: string) => {
      const name = byEtf.get(symbol);
      return escapeHtml(name ? `${name} (${symbol})` : symbol);
    };
    lead = ` · over 21 sessions ${named(best.symbol)} leads ${spct(best.chg21s as number)}, ${named(worst.symbol)} lags ${spct(worst.chg21s as number)}`;
  }
  return `${b("TREND")} — ${escapeHtml("S&P")} ${parts.join(" · ")}${lead}`;
}

/**
 * Economic releases that printed today (§E).
 *
 * Against the street's median where one was sourced and unambiguously joined,
 * and against the prior otherwise. When the prior has since been revised, say so
 * — a revision is often larger than the surprise being reported.
 *
 * The basis line asserts what these figures ARE and never makes a claim about
 * the world. It used to read "no consensus feed", which was true when it was
 * written and is now false; a stored note keeps its own string, but nothing new
 * should ever restate it.
 *
 * `detail = false` is the degraded form for the overflow ladder. The consensus
 * is the first thing to go: it is the figure with an external dependency, and
 * the prior comparison stands on its own.
 */
function macroSection(f: StructuredFacts, detail = true): string {
  const rel = f.macro?.value;
  if (!rel?.length) return "";
  // Sign by the QUANTITY's nature, not by its suffix. Keying off "%" signed
  // every non-percentage level (claims, which are a count) and left percentage
  // *changes* unsigned, contradicting the note's own convention everywhere else.
  const fmt = (v: number, r: { dp: number; suffix: string; signed: boolean }) =>
    `${r.signed && v >= 0 ? "+" : ""}${v.toFixed(r.dp)}${r.suffix}`;
  const items = rel.map((r) => {
    // The revision marker survives the degraded form. It is not framing: quoting
    // a since-revised figure as "prior" without saying so misstates the
    // comparison, and the label is the whole reason we may quote it at all.
    const revised = r.priorRevised ? " revised" : "";
    const cons = detail && r.consensus != null ? ` vs ${fmt(r.consensus, r)} cons` : "";
    return `${escapeHtml(r.label)} ${fmt(r.actual, r)}${cons} vs ${fmt(r.prior, r)} prior${revised}`;
  });
  const anyConsensus = detail && rel.some((r) => r.consensus != null);
  const basis = detail ? (anyConsensus ? " (vs consensus and prior)" : " (vs prior)") : "";
  return `${b("DATA")}${escapeHtml(basis)} — ${items.join(" · ")}`;
}

function ratesSection(f: StructuredFacts, prose?: NoteProse): string {
  if (!f.rates) return "";
  const r: RatesData = f.rates.value;
  const bp = (n: number) => `${n >= 0 ? "+" : ""}${n}bp`;

  // The 2Y tenor is absent on a provisional Yahoo print — drop that chip rather
  // than fabricate it. 10Y and 30Y are always present.
  const tenors = [
    r.y2 != null && r.chg2Bp != null ? bind("2Y", `${r.y2.toFixed(2)}% ${bp(r.chg2Bp)}`) : null,
    bind("10Y", `${r.y10.toFixed(2)}% ${bp(r.chg10Bp)}`),
    bind("30Y", `${r.y30.toFixed(2)}% ${bp(r.chg30Bp)}`),
  ].filter(Boolean);
  const tag = r.provisional ? " (provisional)" : "";
  const l1 = `${b("RATES")}${tag} — ${tenors.join(" · ")}`;
  // The 2s10s clause needs the 2Y; on a provisional print, defer to prose or drop it.
  const spread =
    r.spread2s10Bp != null && r.spread2s10ChgBp != null
      ? `2s10s ${bp(r.spread2s10Bp)} (${bp(r.spread2s10ChgBp)} on the day)`
      : "";
  const l2 = prose?.curveRead ? escapeHtml(prose.curveRead) : spread;
  return l2 ? `${l1}\n${l2}` : l1;
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
/**
 * MOVERS — the day's notable names with their retrieved reason (§B).
 *
 * This is the only place a cause for an individual instrument may appear. The
 * phrase is composed by the assembler and already contains its ticker, so it is
 * emitted verbatim; the model never writes one (§1b). `withReasons = false` is
 * the ladder's degraded form: the names and their moves survive, the clauses go.
 */
function moversSection(f: StructuredFacts, withReasons = true, max = 3): string {
  if (max <= 0) return "";
  const attributed = new Map((f.attributions?.value ?? []).map((a) => [a.ticker, a.phrase]));
  // Strip a phrase back to the bare fact. It always opens "TICKER rose/fell
  // ±x.x%", so the reason is everything after that.
  const bare = (phrase: string) => phrase.match(/^(\S+ (?:rose|fell) [+-][\d.]+%)/)?.[1] ?? phrase;

  const lines: string[] = [];
  // Notes persisted before the ranking was stored have no `movers` fact, so an
  // archived note still re-renders from its attributions alone.
  const ranked = f.movers?.value ?? [];
  if (ranked.length > 0) {
    for (const m of ranked) {
      if (lines.length >= max) break;
      const phrase = attributed.get(m.ticker);
      if (phrase) {
        lines.push(escapeHtml(withReasons ? phrase : bare(phrase)) + ahSuffix(f, m.ticker));
        continue;
      }
      // Rung 7: nothing passed the ladder, so the name and its move stand
      // alone. Floored at the same move the attribution gate uses — below it a
      // bare line is not a mover, it is noise with a ticker attached.
      if (Math.abs(m.changePct) < BARE_MOVER_FLOOR_PCT) continue;
      lines.push(`${escapeHtml(m.ticker)} ${spct(m.changePct)}${ahSuffix(f, m.ticker)}`);
    }
  } else {
    for (const a of (f.attributions?.value ?? []).slice(0, max)) {
      lines.push(escapeHtml(withReasons ? a.phrase : bare(a.phrase)) + ahSuffix(f, a.ticker));
    }
  }

  if (lines.length === 0) return "";
  return `${b("MOVERS")}\n${lines.join("\n")}`;
}

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
  const stance = pin ? gammaStance(pin) : null;
  const parts: string[] = [];
  if (pin && stance) {
    // Which SIDE the pin sits on is the whole actionable content, and
    // `distancePct`'s sign convention is not worth trusting for it — derive the
    // direction from the two prices. The "$" also stops a bare "775" being
    // misread against the index level ("S&P 7,753") one line above.
    const side = pin.pinStrike >= pin.spot ? "above" : "below";
    parts.push(
      `dealers ${stanceWord(stance)} gamma, ${pinNoun(pin, stance)} near $${intFmt(pin.pinStrike)} on ${escapeHtml(pin.symbol)}, ${Math.abs(pin.distancePct).toFixed(1)}% ${side} spot`,
    );
  }
  // The gamma stance is numeral-free, so the validator can't catch an LLM line
  // that states the opposite. Drop a book line that contradicts the fact.
  const contradictsStance =
    stance != null &&
    prose?.book != null &&
    new RegExp(stance.sign === 1 ? "short gamma" : "long gamma", "i").test(prose.book);
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
    // The window spans several days, so anything not on the header's day must
    // carry its own weekday — otherwise Wednesday's CPI reads as Monday's.
    const day =
      e.date === events[0].date
        ? ""
        : new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }) + " ";
    return `${escapeHtml(e.name)} ${escapeHtml(day)}${e.timeEt}${NB}ET`;
  });
  return `${b(`${label}'S TELLS`)} — ${items.join(" · ")}`;
}

function crossPrice(p: CrossAssetPoint): string {
  const v = p.price;
  let num: string;
  if (p.label === "BTC") num = `$${Math.round(v / 1000)}k`;
  else if (p.label === "Gold" || p.label === "Crude") num = `$${intFmt(v)}`;
  // Copper trades near $4-5 a pound, so the whole quote lives in the cents.
  // Rounding it like crude would print "$5" every day of the year.
  else if (p.label === "Copper") num = `$${v.toFixed(2)}`;
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
    // A bare level standing next to a peer that carries a change reads as
    // "unchanged", which is a claim the feed never made. Say once, at the end,
    // that the unsigned quotes are levels only — cheaper than a per-item mark
    // and it keeps the omission visible rather than silent.
    const anyMissing = f.crossAsset.value.some((p) => p.changePct == null);
    const caveat = anyMissing ? escapeHtml(" (unsigned quotes are levels only)") : "";
    lines.push(`${b("CROSS-ASSET")} — ${f.crossAsset.value.map(crossPrice).join(" · ")}${caveat}`);
  }
  if (f.sectors) {
    const tape = sectorTape(f.sectors.value);
    if (tape) lines.push(tape);
  }
  return lines.join("\n");
}

/**
 * "Full note" link — PUSH ONLY. On the web body this renders on the very page
 * it points at, so the only link in the note is a no-op self-reference that
 * reads as "you are missing something". `build` therefore takes it as an opt-in
 * and `renderWeb` never asks for it.
 */
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

/**
 * One rung's worth of build options. An object rather than positional flags:
 * the ladder already assembles exactly this shape per candidate, and an omitted
 * positional flag silently defaulting back to ON is the specific bug
 * `pushLadder` warns about twice below.
 */
interface BuildOptions {
  prose?: NoteProse;
  maxSpotlight?: number;
  showAfterHours?: boolean;
  macroDetail?: boolean;
  moverReasons?: boolean;
  /** Append the "Full note" link. Push only — see `footer`. */
  withFooter?: boolean;
}

function build(
  facts: StructuredFacts,
  webUrl: string,
  {
    prose,
    maxSpotlight = Infinity,
    showAfterHours = true,
    macroDetail = true,
    moverReasons = true,
    withFooter = false,
  }: BuildOptions = {},
): string {
  // After-hours suffixes are ornament, not argument. Stripping them is the
  // cheapest thing the overflow ladder can do, so it happens before any of the
  // note's reasoning is touched.
  if (!showAfterHours) facts = { ...facts, postMarket: null };
  // The claim ledger is filled by the deterministic sections FIRST, so they own
  // their facts and any prose line that merely restates them is dropped.
  const ledger = makeLedger();
  const hook = hookLine(facts, prose);
  const tape = tapeSection(facts);
  const trend = trendSection(facts);
  const macro = macroSection(facts, macroDetail);
  const rates = ratesSection(facts, prose);
  const cross = crossSection(facts);
  const spot = spotlightSection(facts, maxSpotlight);
  const diverge = divergenceSection(facts);
  const movers = moversSection(facts, moverReasons);
  for (const s of [hook, tape, trend, macro, rates, cross, spot, diverge, movers]) ledger.claim(s);

  return [
    hook,
    tape,
    trend,
    macro,
    rates,
    cross,
    spot,
    diverge,
    // MOVERS sits after DIVERGENCE and before the prose (§B): it is the only
    // place a cause for an individual name may appear, and it must render
    // BEFORE the bullets so the claim ledger's ordering guarantee holds.
    movers,
    whatMattersSection(prose, ledger),
    bullBearSection(prose, ledger),
    bookSection(facts, prose, ledger),
    tellsSection(facts),
    withFooter ? footer(webUrl) : "",
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/**
 * Every rung of the overflow ladder, longest first — the note at full strength,
 * then each successive degradation.
 *
 * Exported so the ladder's defining property can actually be tested: each rung
 * must render no longer than the one before it. That is easy to break by
 * omitting a flag (an omitted flag defaults back to ON, re-adding content the
 * previous rung had dropped) and impossible to notice by reading, because the
 * bug only shows on a day heavy enough to reach the affected rung.
 */
export function pushLadder({ facts, webUrl, prose }: RenderInput): string[] {
  const candidates: BuildOptions[] = [];
  if (prose) {
    candidates.push({ prose });
    // Drop the after-hours ornament BEFORE any reasoning. Appending this rung
    // after the prose ladder would strip the note's whole voice while decorative
    // "(+2.1% after hours)" suffixes survived.
    candidates.push({ prose, showAfterHours: false });
    // Macro figures survive; only their framing goes.
    candidates.push({ prose, showAfterHours: false, macroDetail: false });
    // Then the mover reason clauses. The names and their moves survive; only
    // the retrieved explanation goes. Still ahead of any prose, because a
    // reason clause is worth less than the note's reasoning.
    candidates.push({ prose, showAfterHours: false, macroDetail: false, moverReasons: false });
    candidates.push({
      prose: { ...prose, book: undefined },
      showAfterHours: false,
      macroDetail: false,
      moverReasons: false,
    });
    candidates.push({
      prose: { ...prose, book: undefined, bull: undefined, bear: undefined },
      showAfterHours: false,
      macroDetail: false,
      moverReasons: false,
    });
    // Trim What-Matters bullets from the end.
    for (let n = prose.whatMatters.length - 1; n >= 0; n--) {
      // Keep EVERY ornament flag OFF here. Omitting a flag lets it default back
      // to true, so the dropped content was re-added exactly as bullets started
      // being cut — inverting the rule and making the ladder non-monotonic, so a
      // later rung could render longer than an earlier one.
      candidates.push({
        prose: { ...prose, book: undefined, bull: undefined, bear: undefined, whatMatters: prose.whatMatters.slice(0, n) },
        showAfterHours: false,
        macroDetail: false,
        moverReasons: false,
      });
    }
  }
  // Prose-free, but still the FULL deterministic note — and ONLY when there was
  // no prose to begin with. On a day the model is down there is usually plenty
  // of room, so stripping the reason clauses immediately would discard content
  // for nothing.
  //
  // When prose DOES exist, this branch must not re-add anything: by the time the
  // ladder reaches here it has already walked past every stripped form and found
  // none of them small enough, so restoring the after-hours suffixes, the macro
  // framing and the reason clauses would make the note grow at the exact moment
  // it has to shrink.
  if (!prose) {
    candidates.push({});
    // Same drop order as the prose ladder, so the two branches degrade alike.
    candidates.push({ showAfterHours: false });
    candidates.push({ showAfterHours: false, macroDetail: false });
  }
  candidates.push({ showAfterHours: false, macroDetail: false, moverReasons: false });
  // Last resort before throwing: the user can spotlight all 12 sectors, so trim
  // those callouts too rather than failing the send.
  const spotlightCount = facts.spotlight?.value.length ?? 0;
  for (let n = spotlightCount - 1; n >= 0; n--)
    candidates.push({
      maxSpotlight: n,
      showAfterHours: false,
      macroDetail: false,
      moverReasons: false,
    });

  // Every rung is a push, so every rung carries the "Full note" link — it must
  // be inside the measured length, not appended after the cap check.
  return candidates.map((c) => build(facts, webUrl, { ...c, withFooter: true }));
}

/**
 * Telegram HTML push, ≤4096 UTF-16 units (§2). On overflow, degrade in priority
 * order (see `pushLadder`) rather than throwing. Only a fully stripped note that
 * STILL overflows is a true data anomaly worth throwing on.
 */
export function renderPush(input: RenderInput): string {
  const CAP = 4096;
  const rungs = pushLadder(input);
  for (const rendered of rungs) {
    if (rendered.length <= CAP) return rendered;
  }
  const last = rungs[rungs.length - 1] ?? "";
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
  // rather than the possibly-trimmed push. No footer: the "Full note" link
  // would point at the page it is rendered on.
  const push = build(facts, webUrl, { prose });
  const head = push
    .split("\n\n")
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  // Depth sections the push has no room for.
  return [
    head,
    webSectorBoard(facts),
    webMoverTrend(facts),
    webDivergence(facts),
    webContribution(facts),
    webSpotlight(facts),
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

/**
 * Where today's movers sit in their own recent run (§D, single names).
 *
 * Web only. The push's TREND line is about benchmarks, and a reader scanning a
 * notification does not need fifteen names in session context — but on the
 * archive page it answers the question the mover lines raise: is this a break
 * from the name's recent direction, or more of the same?
 *
 * One figure dropped by the split-defect gate shows as "n/a" rather than being
 * quietly left out, so a blank is never mistaken for a flat month. A name that
 * lost BOTH figures has nothing to say and is omitted entirely.
 */
function webMoverTrend(f: StructuredFacts): string {
  const movers = f.movers?.value;
  const tf = f.timeframes?.value;
  if (!movers?.length || !tf?.length) return "";

  const bySymbol = new Map(tf.map((t) => [t.symbol, t]));
  const rows = movers
    .map((m) => {
      // Timeframes are keyed by the Yahoo spelling; movers carry the SPDR one.
      const t = bySymbol.get(toYahooSymbol(m.ticker));
      if (!t || (t.chg5s == null && t.chg21s == null)) return "";
      const fmt = (v: number | null) => (v == null ? "n/a" : spct(v));
      return `<li><code>${escapeHtml(m.ticker)}</code> ${spct(m.changePct)} today · 5-session ${fmt(t.chg5s)} · 21-session ${fmt(t.chg21s)}</li>`;
    })
    .filter((s) => s.length > 0);

  if (rows.length === 0) return "";
  return `<h2>Movers in session context</h2>\n<ul>\n${rows.join("\n")}\n</ul>`;
}
