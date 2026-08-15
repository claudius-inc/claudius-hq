import type { StructuredFacts } from "@/lib/notes/types";
import { Section, TableWrap, Th, Absent, EtClock, NoValue } from "./primitives";
import { toneClass, longDayDate } from "../_lib/format";

/**
 * The forward window the pipeline actually searched, as a readable span.
 *
 * Mirrors `assembleFacts`, which asks FRED for `[date + 1, date + 4]` so a
 * Friday note reaches the following Monday. Kept as calendar arithmetic on the
 * session date rather than read off the events — an EMPTY calendar is exactly
 * the case this sentence exists for, and an empty list carries no dates.
 */
const DAY_MS = 86_400_000;

function forwardWindow(date: string): string {
  const start = new Date(`${date}T12:00:00Z`).getTime() + DAY_MS;
  const end = start + 3 * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return `${longDayDate(iso(start))} and ${longDayDate(iso(end))}`;
}

/**
 * What printed today, and what prints next.
 *
 * Both facts are frequently null, and on the push that means the section simply
 * does not exist — correct there, because the reader gets a fresh message
 * tomorrow. On an archive page the same silence is destructive: three months
 * later, a missing DATA block could mean the calendar was empty or the FRED
 * fetch failed, and those are opposite conclusions. So an empty calendar is
 * stated rather than omitted.
 */
export function CalendarSection({ facts }: { facts: StructuredFacts }) {
  const macro = facts.macro?.value ?? [];
  const events = facts.econEvents?.value ?? [];
  const anyConsensus = macro.some((m) => m.consensus != null);

  const fmt = (v: number, r: { dp: number; suffix: string; signed: boolean }) =>
    `${r.signed && v >= 0 ? "+" : ""}${v.toFixed(r.dp)}${r.suffix}`;

  /**
   * The deterministic context, in words, from stored data rather than a stored
   * sentence — so the phrasing can be improved later and the figure stays
   * re-derivable from its own recorded inputs.
   */
  const contextLine = (m: (typeof macro)[number]): string | null => {
    const c = m.context?.[0];
    if (!c) return null;
    const n = fmt(c.value, { dp: m.dp, suffix: m.suffix, signed: m.signed });
    switch (c.kind) {
      case "annualized":
        return `${n} annualized over ${c.windowPeriods} months`;
      case "average":
        return `${n} average over ${c.windowPeriods} periods`;
      case "levelChange":
        return `${fmt(c.value, { dp: m.dp, suffix: m.suffix, signed: true })} against ${c.windowPeriods} months ago`;
      case "publishedAverage":
        return `${n} on the ${c.windowPeriods}-week average`;
      default:
        return null;
    }
  };

  return (
    <>
      <Section
        id="data"
        title="Data released today"
        fact={facts.macro}
        // Asserts the BASIS of the figures below it, never a claim about the
        // world. The old wording said no free feed carries consensus — true when
        // it was written, false now, and this component renders archived notes
        // too, so a world-claim here would be a freshly false sentence on every
        // one of them.
        intro={
          anyConsensus
            ? "Actual against the street's median, and against the prior reading. The median is one survey's — other desks quote different numbers."
            : "Measured against the prior reading. No survey median could be sourced for this session's releases."
        }
      >
        {macro.length === 0 ? (
          <Absent fact={facts.macro} quiet="No tracked economic releases printed this session." missing="The release calendar" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[32rem]">
              <caption className="sr-only">Economic releases printed this session, actual against prior.</caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <Th>Release</Th>
                  <Th align="right">Actual</Th>
                  <Th align="right">Consensus</Th>
                  <Th align="right">Prior</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {macro.map((m) => (
                  <tr key={m.label} className="hover:bg-gray-50">
                    <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                      {m.label}
                      {/* Context sits under the label, not in its own column: it
                          is a different KIND of figure per release, so a shared
                          header would have to be vague enough to be useless. */}
                      {contextLine(m) && (
                        <span className="block text-[11px] font-normal text-gray-500 tabular-nums">
                          {contextLine(m)}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                      {fmt(m.actual, m)}
                      {/* Above / below / in line — never "beat" or "miss", which
                          import a market interpretation the number does not carry. */}
                      {m.surprise != null && (
                        <span className={`block text-[11px] ${m.surprise === 0 ? "text-gray-500" : toneClass(m.surprise)}`}>
                          {m.surprise === 0
                            ? "in line"
                            : `${fmt(Math.abs(m.surprise), { dp: m.dp, suffix: m.suffix, signed: false })} ${m.surprise > 0 ? "above" : "below"}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                      {m.consensus != null ? (
                        fmt(m.consensus, m)
                      ) : (
                        <NoValue reason="No survey median could be sourced and unambiguously matched for this release" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-600">
                      {fmt(m.prior, m)}
                      {/* A revision is often larger than the surprise being
                          reported, so the caveat travels with the figure. */}
                      {m.priorRevised && (
                        <span className="block text-[11px] text-gray-500">revised since first print</span>
                      )}
                    </td>
                    {/* A release time is a bare ET wall clock; the session date
                        anchors it to a real instant so it can be re-read
                        locally. */}
                    <td className="px-3 py-2 text-sm text-gray-600 tabular-nums">
                      <EtClock date={facts.date} clock={m.timeEt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <Section
        id="tells"
        title="Next session's tells"
        fact={facts.econEvents}
        // A survey median reaches about one session forward and no further, so
        // most of this list carries a range instead. Both are stated; neither is
        // claimed to be the only thing available.
        intro="Scheduled releases ahead, with the street's median where one is published yet and the twelve-month range where it is not."
      >
        {events.length === 0 ? (
          <Absent
            fact={facts.econEvents}
            // Names the window it searched. "In the window ahead" left the
            // reader unable to tell an empty calendar from a short one, and the
            // window is four calendar days rather than the single session the
            // heading implies — the pipeline reaches to `date + 4` so a Friday
            // note carries Monday. Three months on, that difference decides
            // whether the silence means anything.
            quiet={`Nothing tracked is scheduled between ${forwardWindow(facts.date)}. The calendar answered; it is genuinely empty.`}
            missing="The forward calendar"
          />
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li key={`${e.date}-${e.name}`} className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{e.name}</span>{" "}
                {/* Date and time move together. Printing the ET date beside a
                    local clock would put a 2:00pm Wednesday release on
                    Wednesday for a reader whose Wednesday it is not. */}
                <span className="tabular-nums">
                  <EtClock date={e.date} clock={e.timeEt} withDate />
                </span>
                {e.expects ? (
                  <span className="block text-[13px] text-gray-600 tabular-nums">
                    Street looks for {fmt(e.expects.value, e.expects)} on {e.expects.label}, against{" "}
                    {fmt(e.expects.prior, e.expects)} last.
                  </span>
                ) : e.range ? (
                  // The fallback says what a new extreme would take — a stake,
                  // not an expectation, and true whether or not a survey exists.
                  <span className="block text-[13px] text-gray-600 tabular-nums">
                    {e.range.label} last printed {fmt(e.range.last, e.range)}, inside a{" "}
                    {fmt(e.range.low, e.range)}–{fmt(e.range.high, e.range)} twelve-month range.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
