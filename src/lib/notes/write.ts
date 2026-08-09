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
import { collectAllowedNumbers, validateProseField } from "@/lib/notes/validate";
import { deterministicHook } from "@/lib/notes/render";

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
    lines.push(
      `Positioning: dealers net ${g.netGammaPositive ? "LONG" : "SHORT"} gamma on ${g.symbol}; largest-gamma strike (pin) ${num(g.pinStrike)}, spot ${num(g.spot)} (${pct(g.distancePct)} away). Note OI is start-of-day, so treat as directional.`,
    );
  }
  if (f.econEvents) {
    lines.push(
      "Upcoming releases: " +
        f.econEvents.value
          .map((e) => `${e.name} ${e.date} ${e.timeEt} ET${e.consensus != null ? ` (consensus ${e.consensus})` : ""}`)
          .join("; "),
    );
  }
  return lines.join("\n");
}

const RULES = `You are an ex-Goldman Sachs desk head writing "The Tape", a concise daily market note in plain English — skeptical, precise, one bit of desk vernacular at most. Your job: say what ACTUALLY moved the tape vs noise, with a reason attached.

HARD RULES:
- Use ONLY numbers that appear verbatim in the FACT SHEET. Never invent a price, percentage, level, or count. Do NOT introduce forward "watch levels" (e.g. "reclaim $4,300") — those are added elsewhere.
- Every "whatMatters" bullet must carry a because / despite / on-[good/bad]-numbers. No naked price recaps.
- Do not use magnitude adjectives the number doesn't support (a 2bp move is not "a huge flattening").
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
          // This is a reasoning model: it spends tokens on `reasoning_content`
          // BEFORE the answer. A tight budget returns empty content with
          // finish_reason "length". The note itself needs ~500 tokens.
          max_tokens: 4000,
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
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }[];
      usage?: { completion_tokens?: number };
    };
    const msg = json.choices?.[0]?.message;
    // This reasoning model sometimes stops with an empty `content` after
    // writing the answer inside `reasoning_content`. Read that as a fallback
    // instead of losing the whole generation.
    const text = msg?.content || msg?.reasoning_content;
    if (!text) {
      logger.warn(SRC, "Empty DeepSeek response", {
        finishReason: json.choices?.[0]?.finish_reason,
        completionTokens: json.usage?.completion_tokens,
      });
      return null;
    }
    // Take the LAST balanced-looking object: reasoning text often shows a draft
    // before the final answer.
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
  const okField = (t?: string) => (t ? validateProseField(t, allowed).ok : false);
  return {
    hook: okField(p.hook) ? p.hook : deterministicHook(f), // NEVER dropped (§4.1)
    curveRead: okField(p.curveRead) ? p.curveRead : undefined,
    whatMatters: p.whatMatters.filter((x) => validateProseField(x, allowed).ok),
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
