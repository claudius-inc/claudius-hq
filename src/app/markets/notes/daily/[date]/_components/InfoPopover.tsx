"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * A labelled disclosure for method and provenance.
 *
 * The gamma block forced this. Its five sentences of method — which chain, which
 * horizon, which dealer-side assumption, how stale the open interest is — ran
 * LONGER than the two-sentence claim they qualify, and sat directly beneath it
 * in the same column. Provenance that outweighs its own finding is provenance
 * nobody reads, and it pushed the next section below the fold for no gain.
 *
 * Deliberately NOT a `title` attribute and NOT a hover card: the content is
 * paragraphs, `title` is unreachable on touch and by keyboard, and a hover
 * target that holds five paragraphs cannot be read on a phone at all.
 *
 * The only client component on the note page. Everything else renders on the
 * server, so this is a leaf import rather than a `"use client"` on
 * `primitives.tsx`, which would drag every table and chart into the bundle.
 */
export function InfoPopover({
  label,
  title,
  children,
}: {
  /** The trigger's own text, e.g. "How this is measured". */
  label: string;
  /** Heading inside the panel — names the KIND of content, not the subject. */
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Dismiss on an outside click or Escape. Both listeners are attached only
  // while open — an always-on document listener per popover is a cost the page
  // pays on every render for a control most readers never touch.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the trigger, not to the top of the document —
      // otherwise Escape costs a keyboard reader their place on the page.
      wrapRef.current?.querySelector("button")?.focus();
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Flip the panel's anchor when it would overflow the viewport. Measured after
  // paint rather than guessed from the trigger's position: the panel is wider
  // than its trigger and the note column is centred, so which edge overflows
  // depends on the viewport, not on the markup.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    setAlignRight(false);
    const box = panelRef.current.getBoundingClientRect();
    if (box.right > document.documentElement.clientWidth - 8) setAlignRight(true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
          open
            ? "border-gray-400 bg-gray-50 text-gray-900"
            : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900"
        }`}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none"
        >
          i
        </span>
        {label}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={title}
          className={`absolute top-[calc(100%+0.375rem)] z-50 w-[min(30rem,calc(100vw-3rem))] rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </p>
          <div className="space-y-2 text-xs leading-relaxed text-gray-600">{children}</div>
        </div>
      )}
    </span>
  );
}
