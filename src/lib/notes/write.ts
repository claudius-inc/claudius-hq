/**
 * WRITE PROSE — see docs/daily-note-spec.md §8.2.
 *
 * Turns StructuredFacts into the note's voice (hook, one-line curve read, 3–4
 * What-Matters bullets, bull, bear, book) using DeepSeek. Numbers NEVER
 * originate from the model: the prose is validated numeral-by-numeral against
 * the fact pool (§8.3), regenerated once on violations, then any still-failing
 * field is dropped — except the hook, which falls back to a deterministic
 * template.
 *
 * DeepSeek exposes an OpenAI-compatible /chat/completions endpoint, so this
 * calls it with plain fetch — no SDK dependency. `response_format: json_object`
 * keeps the reply parseable (DeepSeek requires the word "json" in the prompt
 * for that mode, which RULES supplies).
 *
 * Prose is additive: if DEEPSEEK_API_KEY is unset or the model fails/returns
 * junk, this returns null and the pipeline ships the deterministic note.
 */
import { logger } from "@/lib/logger";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import {
  collectAllowedNumbers,
  validateProseField,
  checkCausalRule,
  checkLexicon,
  collectProseSubjects,
} from "@/lib/notes/validate";
import { deterministicHook } from "@/lib/notes/render";
import { gammaStance, stanceWord, pinNoun } from "@/lib/notes/gamma-stance";

const SRC = "notes/write";
const API_URL = "https://api.deepseek.com/chat/completions";
/** Model id is configurable so a rename does not need a code change. */
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
/** Tries before the note ships without prose. 3 × 60s stays inside the job budget. */
const MAX_ATTEMPTS = 3;

// Display formatters, identical to the renderer's. The model quotes whatever
// string it is shown, so handing it raw values was the sole cause of the note
// mixing "+1.3%" with "+1.49%" and "1.90" with "1.9" for the same quantities.
const pct = (n: number, dp = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** Exact numbers the model may use, as a plain-text sheet. */
function factSheet(f: StructuredFacts): string {
  const lines: string[] = [`Date: ${f.date}`];
  if (f.indices) lines.push("Indices: " + f.indices.value.map((i) => `${i.name} ${num(i.close)} (${pct(i.changePct)})`).join(", "));
  if (f.rates) {
    const r = f.rates.value;
    lines.push(`Rates: 2Y ${r.y2.toFixed(2)}% (${r.chg2Bp}bp), 10Y ${r.y10.toFixed(2)}% (${r.chg10Bp}bp), 30Y ${r.y30.toFixed(2)}% (${r.chg30Bp}bp); 2s10s ${r.spread2s10Bp}bp (${r.spread2s10ChgBp}bp on day)`);
  }
  if (f.vix) {
    const v = f.vix.value;
    lines.push(`VIX: ${v.level.toFixed(1)} (${v.change >= 0 ? "+" : ""}${v.change.toFixed(1)}), ${v.percentile}th percentile of this year's ${v.ytdLow.toFixed(1)}-${v.ytdHigh.toFixed(1)} range, ${v.trendDir} ${v.trendDays} days`);
  }
  if (f.crossAsset) lines.push("Cross-asset: " + f.crossAsset.value.map((c) => `${c.label} ${num(c.price)}${c.changePct != null ? ` (${pct(c.changePct)})` : ""}`).join(", "));
  if (f.sectors) lines.push("Sectors (1d%): " + f.sectors.value.map((s) => `${s.name} ${pct(s.changePct)}`).join(", "));
  // Labelled as industries, not sectors, and told they are already inside one:
  // "semis led the sectors" would be a false claim about a slice of Technology.
  if (f.thematics?.value.length) {
    lines.push(
      "Industry groups (1d%) — NOT sectors; each sits INSIDE a sector above and its members are already counted there: " +
        f.thematics.value.map((s) => `${s.name} (${s.etf}) ${pct(s.changePct)}`).join(", "),
    );
  }
  if (f.breadth) {
    const bd = f.breadth.value;
    lines.push(`Breadth (NYSE): ${num(bd.advances)} advancers / ${num(bd.declines)} decliners, A/D ${bd.ratio.toFixed(2)}, new highs ${bd.newHighs} / new lows ${bd.newLows}`);
  }
  if (f.divergence) {
    lines.push(
      "Within-sector divergence (names moving AGAINST their sector — the key tell):\n" +
        f.divergence.value
          .map(
            (d) =>
              `  ${d.sectorName} (${d.etf}) ${pct(d.sectorChangePct)} ${d.direction} — bucking it: ` +
              d.names.map((n) => `${n.ticker} ${pct(n.changePct)}`).join(", "),
          )
          .join("\n"),
    );
  }
  if (f.contribution) {
    const c = f.contribution.value;
    // The flip means opposite things up vs down: on a green day the index only
    // held up ON those names; on a red day it was only down BECAUSE of them.
    // Getting this backwards would be a false causal claim with no numeral for
    // the validator to catch, so state the direction explicitly.
    const flip = c.flipsWithoutTop
      ? c.actualPct >= 0
        ? " (SIGN FLIPS — the index only held up on those names; without them it is negative)"
        : " (SIGN FLIPS — the index was only down because of those names; without them it is positive)"
      : "";
    lines.push(
      `Index concentration: top movers ${c.topNames.join(", ")} contributed ${c.topPoints.toFixed(2)}pp of the S&P's ${pct(c.actualPct)}; ex-those names the index is ${pct(c.exTopPct)}${flip}`,
    );
  }
  if (f.gexPin) {
    const g = f.gexPin.value;
    const stance = gammaStance(g);
    if (stance) {
      // SPY scale throughout, never the index equivalent. The converted figure is
      // renderer-owned and deliberately unpooled (§H0.1), so showing it here
      // would invite the model to cite a numeral the validator must drop.
      const zero = g.zeroGamma != null ? `; total gamma turns ${stance.sign === 1 ? "negative" : "positive"} near ${num(g.zeroGamma)}` : "";
      lines.push(
        `Positioning: dealers net ${stanceWord(stance).toUpperCase()} gamma on ${g.symbol}; largest-gamma strike (${pinNoun(g, stance)}) ${num(g.pinStrike)}, spot ${num(g.spot)} (${pct(g.distancePct)} away)${zero}. OI is start-of-day, so treat as directional.`,
      );
    }
  }
  // Length, not presence: a reached-but-empty calendar is a legitimate fact
  // (see `fetchMacroReleases`), and heading an empty list with "Economic data
  // released TODAY:" invites the model to fill the silence.
  if (f.macro?.value.length) {
    // Without this the model never learns that CPI printed today, so on the
    // day's most important number it structurally cannot lead with it — while
    // the validator pooled those numerals as though prose could use them.
    const sfmt = (v: number, m: { dp: number; suffix: string; signed: boolean }) =>
      `${m.signed && v >= 0 ? "+" : ""}${v.toFixed(m.dp)}${m.suffix}`;
    lines.push(
      "Economic data released TODAY. Where a consensus is shown it is ONE survey's median (Investing.com's), not the only street number — say 'above/below/in line with consensus', never 'beat', 'miss', 'hot' or 'cool': " +
        f.macro.value
          .map((m) => {
            const cons = m.consensus != null ? ` vs ${sfmt(m.consensus, m)} consensus` : " (no consensus sourced)";
            const ctx = m.context?.[0] ? `, ${sfmt(m.context[0].value, m)} on the ${m.context[0].windowPeriods}-period ${m.context[0].kind}` : "";
            return (
              `${m.label} ${sfmt(m.actual, m)}${cons} vs ${sfmt(m.prior, m)} prior` +
              `${m.priorRevised ? " (that prior has since been revised)" : ""}${ctx}`
            );
          })
          .join("; "),
    );
  }
  if (f.timeframes) {
    const named = f.timeframes.value.filter((t) => t.chg5s != null || t.chg21s != null);
    if (named.length > 0) {
      lines.push(
        "Recent run (5 and 21 SESSIONS, not calendar weeks/months): " +
          named
            .map(
              (t) =>
                `${t.symbol} ${t.chg5s != null ? `5s ${pct(t.chg5s)}` : "5s n/a"}, ${t.chg21s != null ? `21s ${pct(t.chg21s)}` : "21s n/a"}`,
            )
            .join("; "),
      );
    }
  }
  if (f.postMarket) {
    lines.push(
      "After hours (indicative, no volume data — the close is the fact): " +
        f.postMarket.value.map((m) => `${m.ticker} ${pct(m.changePct)} as of ${m.asOfEt} ET`).join(", "),
    );
  }
  if (f.econEvents?.value.length) {
    lines.push(
      "Upcoming releases. A consensus is published about one session ahead and not beyond, so most of these carry only a range — do NOT invent an expectation for the ones without one: " +
        f.econEvents.value
          .map((e) => {
            const x = e.expects;
            const r = e.range;
            const f2 = (v: number, s: { dp: number; suffix: string; signed: boolean }) =>
              `${s.signed && v >= 0 ? "+" : ""}${v.toFixed(s.dp)}${s.suffix}`;
            if (x) return `${e.name} ${e.date} ${e.timeEt} ET — street looks for ${f2(x.value, x)} vs ${f2(x.prior, x)} last`;
            if (r) return `${e.name} ${e.date} ${e.timeEt} ET — ${r.label} last ${f2(r.last, r)}, 12-month range ${f2(r.low, r)} to ${f2(r.high, r)}`;
            return `${e.name} ${e.date} ${e.timeEt} ET`;
          })
          .join("; "),
    );
  }
  return lines.join("\n");
}

const RULES = `You are an ex-Goldman Sachs desk head writing "The Tape", a concise daily market note in plain English — skeptical, precise, one bit of desk vernacular at most. Your job: say what ACTUALLY moved the tape vs noise, with a reason attached.

HARD RULES:
- Use ONLY numbers that appear verbatim in the FACT SHEET. Never invent a price, percentage, level, or count. Do NOT introduce forward "watch levels" (e.g. "reclaim $4,300") — those are added elsewhere.
- Every "whatMatters" bullet must carry a because / despite. No naked price recaps.
- DO NOT NAME INDIVIDUAL COMPANIES in any field — not by ticker ("AKAM") and not by name ("Akamai"). The note already prints the movers and their reasons on its own lines, immediately above yours. Refer to them collectively ("three of the four biggest reporters fell") or by sector. A field that names a company either way alongside a causal word is deleted before sending.
- Do not use magnitude adjectives the number doesn't support (a 2bp move is not "a huge flattening").
- NEVER write "hot", "cool", "hawkish", "dovish", "beat", "missed expectations", "blowout", "disappointing", or "upside/downside surprise". A consensus makes the SURPRISE a fact; it does not make the CONSEQUENCE one. Say "above consensus", "below consensus", "in line". A field using a banned word is deleted before sending.
- Do NOT write conditional forecasts ("if PPI comes in above consensus, the front end sells off"). What a print will do is not in the fact sheet.
- Lead the hook with the day's divergence + the single most important number. Hook ≤ 120 characters, plain text, no emoji.
- Balance bull vs bear (one line each, each a specific argument). Keep it tight.
- If a section has nothing real to say, omit it (empty string / omit the key).
- The tape, rates, cross-asset, sector and divergence lines are ALREADY PRINTED above your text. Do not repeat their digits. Refer to those facts in words instead ("advancers beat decliners nearly two to one", not "1,808 vs 951"). A line that only restates printed numbers is deleted before sending.
- Write percent changes to one decimal, yields to two, and index levels with a thousands separator, exactly as the fact sheet shows them.

Return ONLY a JSON object (no markdown fence) with keys:
{
  "hook": string,
  "curveRead": string,        // one line on the rates curve + why
  "whatMatters": string[],    // exactly 3. Each is "Short claim. Evidence." — a verdict of 5 words or fewer ending in a period, then the evidence in under 90 characters. The claim is rendered in bold, so it must stand alone.
  "bull": string,
  "bear": string,
  "book": string              // positioning colour ONLY. The dealer gamma stance and the pin strike are already printed for you — do NOT restate them. Return "" unless you can add something they do not say.
}`;

async function generate(f: StructuredFacts, violations: string[]): Promise<NoteProse | null> {
  const retryNote =
    violations.length > 0
      ? `\n\nYOUR PREVIOUS DRAFT CITED NUMBERS NOT IN THE FACT SHEET: ${violations.join(", ")}. Rewrite using only fact-sheet numbers.`
      : "";
  const userPrompt = `FACT SHEET:\n${factSheet(f)}${retryNote}`;

  // Collapse internal whitespace so stray newlines don't split Telegram blocks.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? norm(v) : undefined);

  try {
    const res = await withTimeout(
      fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: RULES },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          // This is a reasoning model, and `max_tokens` caps reasoning AND
          // content together — so the budget must cover the thinking, not the
          // answer. Measured reasoning cost on a full fact sheet is 4.2k–10.1k
          // tokens; the note itself needs ~500. At 4000 the reasoning consumed
          // the entire budget and content came back empty with finish_reason
          // "length" on every single call, which killed the prose layer
          // outright. Leave generous headroom above the observed ceiling.
          max_tokens: 16000,
        }),
      }),
      60_000,
    );
    if (!res) return null;
    if (!res.ok) {
      logger.warn(SRC, `DeepSeek request failed: ${res.status}`, {
        body: (await res.text()).slice(0, 200),
      });
      return null;
    }
    const json = (await res.json()) as {
      choices?: {
        message?: { content?: string };
        finish_reason?: string;
      }[];
      usage?: {
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };
    const choice = json.choices?.[0];
    // Budget exhaustion must never look like success. When the model stops on
    // "length" it was cut off mid-thought, so whatever came back is a fragment
    // — treating it as an answer is how a truncated draft ships as the note.
    if (choice?.finish_reason === "length") {
      logger.warn(SRC, "DeepSeek hit the token ceiling before answering; raise max_tokens", {
        completionTokens: json.usage?.completion_tokens,
        reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
      });
      return null;
    }
    // ONLY `content` is the answer. `reasoning_content` is the model's
    // scratchpad, and it is full of drafts, plans and schema sketches — reading
    // it as a fallback published a note whose every field was the literal
    // placeholder "..." (2026-08-11), because a planning skeleton has the right
    // keys, no numerals and no tickers, so both validators pass it.
    const text = choice?.message?.content;
    if (!text) {
      logger.warn(SRC, "Empty DeepSeek response", {
        finishReason: choice?.finish_reason,
        completionTokens: json.usage?.completion_tokens,
      });
      return null;
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn(SRC, "No JSON object in model response");
      return null;
    }
    const raw = JSON.parse(match[0]) as Partial<NoteProse>;
    return {
      hook: str(raw.hook) ?? "",
      curveRead: str(raw.curveRead),
      whatMatters: Array.isArray(raw.whatMatters)
        ? raw.whatMatters.filter((x): x is string => typeof x === "string" && !!x.trim()).map(norm).slice(0, 4)
        : [],
      bull: str(raw.bull),
      bear: str(raw.bear),
      book: str(raw.book),
    };
  } catch (error) {
    logger.error(SRC, "Prose generation failed", { error });
    return null;
  }
}

/** Resolve to null if the promise doesn't settle within `ms` (Gemini hang guard). */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function allViolations(p: NoteProse, allowed: number[]): string[] {
  const fields = [p.hook, p.curveRead, ...p.whatMatters, p.bull, p.bear, p.book].filter(
    (x): x is string => !!x,
  );
  return fields.flatMap((t) => validateProseField(t, allowed).unsupported);
}

/** Drop fields that still cite unsupported numbers; template-fallback the hook. */
function applyFallbacks(f: StructuredFacts, p: NoteProse, allowed: number[]): NoteProse {
  // Tickers AND company names: "Akamai fell after the print" must fail exactly
  // as "AKAM fell after the print" does, or the rule is a spelling preference.
  const subjects = collectProseSubjects(f);
  // A field must clear BOTH gates: its numerals must be supported (§8.3), and
  // it must not name an instrument alongside a causal connective (§1b). The
  // second stops an invented mechanism riding on a legitimately-pooled number.
  const okField = (t?: string) =>
    !!t && validateProseField(t, allowed).ok && checkCausalRule(t, subjects).ok && checkLexicon(t).ok;

  for (const t of [p.hook, p.curveRead, ...p.whatMatters, p.bull, p.bear, p.book]) {
    if (!t) continue;
    const causal = checkCausalRule(t, subjects);
    if (!causal.ok) {
      logger.info(SRC, "Dropping field: names an instrument with a causal connective (§1b)", {
        subject: causal.subject,
        connective: causal.connective,
      });
    }
    // A sourced consensus makes the surprise a fact, not the consequence. These
    // words state the consequence and dress it as description.
    const lex = checkLexicon(t);
    if (!lex.ok) {
      logger.info(SRC, "Dropping field: expectation-loaded language", { word: lex.word });
    }
  }

  return {
    hook: okField(p.hook) ? p.hook : deterministicHook(f), // NEVER dropped (§4.1)
    curveRead: okField(p.curveRead) ? p.curveRead : undefined,
    whatMatters: p.whatMatters.filter((x) => okField(x)),
    bull: okField(p.bull) ? p.bull : undefined,
    bear: okField(p.bear) ? p.bear : undefined,
    book: okField(p.book) ? p.book : undefined,
  };
}

/** Generate validated prose, or null to fall back to the deterministic note. */
export async function writeProse(f: StructuredFacts): Promise<NoteProse | null> {
  if (!process.env.DEEPSEEK_API_KEY) {
    logger.warn(SRC, "DEEPSEEK_API_KEY not set; shipping deterministic note");
    return null;
  }
  const allowed = collectAllowedNumbers(f);

  // The model is flaky: measured failure modes are an empty `content`, a
  // non-JSON reply, and an occasional ECONNRESET. Each is transient, so retry
  // before giving up the whole prose layer.
  let prose: NoteProse | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !prose; attempt++) {
    prose = await generate(f, []);
    if (!prose && attempt < MAX_ATTEMPTS) {
      logger.info(SRC, `Prose attempt ${attempt} failed; retrying`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!prose) {
    logger.warn(SRC, `No prose after ${MAX_ATTEMPTS} attempts; shipping deterministic note`);
    return null;
  }

  const violations = allViolations(prose, allowed);
  if (violations.length > 0) {
    logger.info(SRC, "Regenerating prose after numeral violations", { violations });
    const retry = await generate(f, violations);
    if (retry) prose = retry;
  }

  const final = applyFallbacks(f, prose, allowed);
  logger.info(SRC, "Prose ready", {
    whatMatters: final.whatMatters.length,
    dropped: {
      curveRead: !final.curveRead,
      bull: !final.bull,
      bear: !final.bear,
      book: !final.book,
    },
  });
  return final;
}
