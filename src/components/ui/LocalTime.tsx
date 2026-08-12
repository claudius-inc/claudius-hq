"use client";

import { useEffect, useState } from "react";
import {
  ET_ZONE,
  formatClock,
  isEasternClock,
  relativeAge,
  viewerZone,
  zoneAbbr,
  zoneName,
} from "@/lib/time/zones";

/*
 * Clocks the reader can act on.
 *
 * The market data is ET and the reader usually is not, so every timestamp
 * renders in the viewer's own zone. Only the browser knows that zone, which
 * forces the shape of all three components below: render the ET reading on the
 * server, then swap to the local reading after mount. The first paint is
 * therefore truthful rather than blank, and a reader with no JavaScript still
 * gets a labelled time instead of nothing.
 *
 * `TimezoneNote` is not decoration. Once times move off ET, a reader who knows
 * the US close is 4pm has to be told why the page says 4am, or they will read
 * the page as broken.
 */

/** The sentence shown until the browser reports its zone — true at that point. */
const ET_NOTE = "All times in ET.";

interface LocalTimeProps {
  /** ISO instant. */
  iso: string;
  /** Prefix the weekday and date. Use where the date is part of the claim. */
  withDate?: boolean;
  className?: string;
}

/** One instant, in the viewer's zone, always carrying its zone label. */
export function LocalTime({ iso, withDate = false, className }: LocalTimeProps) {
  const at = new Date(iso);
  const valid = !Number.isNaN(at.getTime());

  const [text, setText] = useState(() =>
    valid ? formatClock(at, ET_ZONE, { withDate, abbr: "ET" }) : "",
  );

  useEffect(() => {
    const local = new Date(iso);
    if (Number.isNaN(local.getTime())) return;
    setText(formatClock(local, viewerZone(), { withDate, markEtDayShift: true }));
  }, [iso, withDate]);

  if (!valid) return null;
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}

/** Which zone the page is printing, and that it is not the market's own. */
export function TimezoneNote({ className }: { className?: string }) {
  const [label, setLabel] = useState(ET_NOTE);

  useEffect(() => {
    const now = new Date();
    const tz = viewerZone();
    const name = zoneName(tz, now);
    const abbr = zoneAbbr(tz, now);
    const zone = name === abbr ? name : `${name} (${abbr})`;
    setLabel(isEasternClock(tz, now) ? `All times in ${zone}.` : `All times in ${zone}, not ET.`);
  }, []);

  return <span className={className}>{label}</span>;
}

/**
 * How stale the page is, in words.
 *
 * Computed in the browser and re-read every half minute, because the server's
 * answer freezes the moment the page is cached or the tab is left open — and a
 * freshness line that is itself stale is worse than none.
 */
export function LastUpdated({
  iso,
  prefix = "Last updated",
  className,
}: {
  iso: string;
  prefix?: string;
  className?: string;
}) {
  const at = new Date(iso);
  const valid = !Number.isNaN(at.getTime());

  const [text, setText] = useState(() => (valid ? relativeAge(at, new Date()) : ""));
  const [title, setTitle] = useState(() =>
    valid ? formatClock(at, ET_ZONE, { withDate: true, abbr: "ET" }) : "",
  );

  useEffect(() => {
    const stamp = new Date(iso);
    if (Number.isNaN(stamp.getTime())) return;
    setTitle(formatClock(stamp, viewerZone(), { withDate: true }));

    const tick = () => setText(relativeAge(stamp, new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  if (!valid) return null;
  return (
    // The server's clock and the browser's rarely agree to the minute, and the
    // difference is the whole point of re-reading it here.
    <time dateTime={iso} title={title} className={className} suppressHydrationWarning>
      {`${prefix} ${text}`}
    </time>
  );
}
