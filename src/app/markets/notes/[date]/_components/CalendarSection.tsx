import type { StructuredFacts } from "@/lib/notes/types";
import { Section, TableWrap, Th, Absent, EtClock } from "./primitives";

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

  const fmt = (v: number, r: { dp: number; suffix: string; signed: boolean }) =>
    `${r.signed && v >= 0 ? "+" : ""}${v.toFixed(r.dp)}${r.suffix}`;

  return (
    <>
      <Section
        id="data"
        title="Data released today"
        fact={facts.macro}
        intro="Measured against the prior reading, not a consensus — no free feed carries consensus, so calling a gap a miss would be untrue."
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
                  <Th align="right">Prior</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {macro.map((m) => (
                  <tr key={m.label} className="hover:bg-gray-50">
                    <th scope="row" className="px-3 py-2 text-sm font-medium text-gray-900 text-left">
                      {m.label}
                    </th>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900">
                      {fmt(m.actual, m)}
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
        intro="Scheduled releases ahead. No consensus and no prior — the event and its time are the whole claim."
      >
        {events.length === 0 ? (
          <Absent fact={facts.econEvents} quiet="No scheduled releases in the window ahead." missing="The forward calendar" />
        ) : (
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={`${e.date}-${e.name}`} className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{e.name}</span>{" "}
                {/* Date and time move together. Printing the ET date beside a
                    local clock would put a 2:00pm Wednesday release on
                    Wednesday for a reader whose Wednesday it is not. */}
                <span className="tabular-nums">
                  <EtClock date={e.date} clock={e.timeEt} withDate />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
