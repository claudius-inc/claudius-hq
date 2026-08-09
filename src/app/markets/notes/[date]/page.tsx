import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, dailyNotes } from "@/db";
import { PageHero } from "@/components/PageHero";

// The note is written by the generation script (no Next context to call
// revalidatePath from), so read fresh from the DB on each request.
export const dynamic = "force-dynamic";

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DailyNotePage(props: { params: Promise<{ date: string }> }) {
  const params = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) notFound();

  const rows = await db.select().from(dailyNotes).where(eq(dailyNotes.date, params.date)).limit(1);
  const note = rows[0];
  if (!note) notFound();

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      <PageHero title="The Tape" subtitle={`Daily market note · ${prettyDate(note.date)}`} />

      <article
        className="prose prose-sm max-w-none text-gray-800 leading-relaxed [&_code]:font-mono [&_code]:text-gray-900"
        dangerouslySetInnerHTML={{ __html: note.webBody }}
      />

      <p className="mt-10 text-xs text-gray-400">
        Not investment advice. Educational purposes only.
      </p>
    </div>
  );
}
