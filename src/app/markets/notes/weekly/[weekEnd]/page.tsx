import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, weeklyNotes } from "@/db";
import { PageHero } from "@/components/PageHero";

// Written by an external tsx script, which has no Next context to revalidate
// from, so read fresh per request.
export const dynamic = "force-dynamic";

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function WeeklyWrapPage(props: { params: Promise<{ weekEnd: string }> }) {
  const params = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.weekEnd)) notFound();

  const rows = await db.select().from(weeklyNotes).where(eq(weeklyNotes.weekEnd, params.weekEnd)).limit(1);
  const note = rows[0];
  if (!note) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      <PageHero
        title="The Week"
        // The span is stated rather than assumed: a holiday-shortened week says
        // so, and the anchor makes the measured period explicit.
        subtitle={`Weekly wrap · week ending ${prettyDate(note.weekEnd)} · ${note.sessions} session${note.sessions === 1 ? "" : "s"} since ${prettyDate(note.weekStart)}`}
      />

      <article
        className="prose prose-sm max-w-none text-gray-800 leading-relaxed [&_code]:font-mono [&_code]:text-gray-900"
        dangerouslySetInnerHTML={{ __html: note.webBody }}
      />
    </div>
  );
}
