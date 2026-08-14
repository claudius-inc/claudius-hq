import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deterministicHook } from "@/lib/notes/render";
import { PageHero } from "@/components/PageHero";
import { LastUpdated, TimezoneNote } from "@/components/ui/LocalTime";
import { loadNote, sectionRailItems } from "./_lib/note-data";
import { prettyDate } from "./_lib/format";
import { Scoreboard } from "./_components/Scoreboard";
import { TheRead } from "./_components/TheRead";
import { MarketsSection } from "./_components/MarketsSection";
import { SectorBoard } from "./_components/SectorBoard";
import { MoversSection } from "./_components/MoversSection";
import { DivergenceSection } from "./_components/DivergenceSection";
import { ConcentrationSection } from "./_components/ConcentrationSection";
import { SpotlightSection } from "./_components/SpotlightSection";
import { CalendarSection } from "./_components/CalendarSection";
import { SectionRail, NoteFooterNav, SourcesFooter } from "./_components/NoteNav";

// The note is written by the generation script (no Next context to call
// revalidatePath from), so read fresh from the DB on each request.
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Per-note metadata. Without it every note in the archive is titled "Claudius
 * HQ" — indistinguishable in the tab bar, in history, in bookmarks and in any
 * shared link preview.
 */
export async function generateMetadata(props: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await props.params;
  if (!DATE_RE.test(date)) return { title: "Note not found" };

  const note = await loadNote(date);
  if (!note) return { title: "Note not found" };

  const title = `The Tape — ${prettyDate(note.date)}`;
  const description = note.prose?.hook ?? deterministicHook(note.facts);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: note.facts.generatedAt,
    },
  };
}

export default async function DailyNotePage(props: { params: Promise<{ date: string }> }) {
  const params = await props.params;
  if (!DATE_RE.test(params.date)) notFound();

  const note = await loadNote(params.date);
  if (!note) notFound();

  const { facts, prose } = note;

  // The deterministic hook is a NOTIFICATION preview — it exists so a Telegram
  // banner is readable without opening anything, and every number in it is
  // repeated by the scoreboard directly below. On the web that banner does not
  // exist, so only genuine LLM prose earns the standfirst slot.
  const standfirst = prose?.hook ?? null;

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHero title="The Tape" subtitle={`Daily market note · ${prettyDate(note.date)}`} />

      {/* Tucked under the hero rather than inside it: freshness and zone are
          about how to read the page, not what the page is. The zone note is
          load-bearing — the numbers below are a US session, so a reader who
          sees a 4am close needs to be told the clock moved, not the market. */}
      <p className="-mt-7 mb-8 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <LastUpdated iso={facts.generatedAt} />
        <span aria-hidden="true">&middot;</span>
        <TimezoneNote />
      </p>

      <div className="space-y-8">
        {standfirst && (
          <p className="text-lg text-gray-900 leading-snug max-w-[62ch]">{standfirst}</p>
        )}

        <Scoreboard facts={facts} />

        <SectionRail sections={sectionRailItems(facts, prose)} />

        <TheRead facts={facts} prose={prose} />

        <MarketsSection facts={facts} />
        <SectorBoard facts={facts} />
        <MoversSection facts={facts} />
        <DivergenceSection facts={facts} />
        <ConcentrationSection facts={facts} />
        <SpotlightSection facts={facts} />
        <CalendarSection facts={facts} />

        <NoteFooterNav prevDate={note.prevDate} nextDate={note.nextDate} weekEnd={note.weekEnd} />

        <SourcesFooter facts={facts} />

        <p className="text-xs text-gray-600 border-t border-gray-200 pt-4">
          Not investment advice. Educational purposes only.
        </p>
      </div>
    </div>
  );
}
