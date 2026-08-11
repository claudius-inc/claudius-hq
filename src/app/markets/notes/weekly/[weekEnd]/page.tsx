import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, weeklyNotes } from "@/db";
import { PageHero } from "@/components/PageHero";

// Written by an external tsx script, which has no Next context to revalidate
// from, so read fresh per request.
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata(props: {
  params: Promise<{ weekEnd: string }>;
}): Promise<Metadata> {
  const { weekEnd } = await props.params;
  if (!DATE_RE.test(weekEnd)) return { title: "Wrap not found" };
  const rows = await db
    .select({ weekEnd: weeklyNotes.weekEnd })
    .from(weeklyNotes)
    .where(eq(weeklyNotes.weekEnd, weekEnd))
    .limit(1);
  if (!rows[0]) return { title: "Wrap not found" };
  return { title: `The Week — ending ${prettyDate(weekEnd)}` };
}

export default async function WeeklyWrapPage(props: { params: Promise<{ weekEnd: string }> }) {
  const params = await props.params;
  if (!DATE_RE.test(params.weekEnd)) notFound();

  const rows = await db.select().from(weeklyNotes).where(eq(weeklyNotes.weekEnd, params.weekEnd)).limit(1);
  const note = rows[0];
  if (!note) notFound();

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <PageHero
        title="The Week"
        // The span is stated rather than assumed: a holiday-shortened week says
        // so, and the anchor makes the measured period explicit.
        subtitle={`Weekly wrap · week ending ${prettyDate(note.weekEnd)} · ${note.sessions} session${note.sessions === 1 ? "" : "s"} since ${prettyDate(note.weekStart)}`}
      />

      {/*
        `prose` styles `<code>` with a "`" in ::before and ::after, so every
        ticker in the body rendered as `XLE` — a markdown artifact on a page
        whose whole pitch is factual precision. Suppress both pseudo-elements.
      */}
      <article
        className="prose prose-sm max-w-none text-gray-600 leading-relaxed [&_code]:font-mono [&_code]:text-gray-900 [&_code]:before:content-none [&_code]:after:content-none"
        dangerouslySetInnerHTML={{ __html: note.webBody }}
      />
    </div>
  );
}
