"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

interface Section {
  href: string;
  label: string;
  /**
   * The section's own landing page, rather than one of its sub-sections.
   *
   * It still appears in the menu and still gets the checkmark, but the trigger
   * shows the plain section name for it — "Notes", not "Notes › All notes".
   * Without this the landing page has to be either mislabelled as a sub-section
   * or left out of the menu entirely, and leaving it out makes it unreachable
   * once a tab has sub-tabs, because the tab itself is no longer a link.
   */
  root?: boolean;
}

/**
 * The section the current path belongs to, or null.
 *
 * Longest match wins, and that is the whole rule: sibling sections nest inside
 * one another's prefixes, so `/markets/notes/13f/2026-03-31` matches both
 * `/markets/notes` and `/markets/notes/13f` and only the deeper one is right.
 * A first-match-wins rule would label every quarterly note "Daily".
 *
 * The `+ "/"` is equally load-bearing: a bare `startsWith` would make
 * `/markets/notes-archive` match `/markets/notes`.
 *
 * Exported so the rule can be tested without mounting the component.
 */
export function resolveSection<T extends Section>(sections: T[], pathname: string): T | null {
  return (
    sections
      .filter((s) => pathname === s.href || pathname.startsWith(s.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

interface NavSectionSwitcherProps {
  sections: Section[];
  /** Optional label rendered before the current section, e.g. "Scanner › Stocks". */
  prefix?: string;
  /** Fallback shown when no section matches the current path. Defaults to "Navigate". */
  placeholder?: string;
}

export function NavSectionSwitcher({
  sections,
  prefix,
  placeholder = "Navigate",
}: NavSectionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const current = resolveSection(sections, pathname);
  // The menu tracks `current`; the trigger tracks this. They differ only on the
  // section's own landing page, which names itself rather than a sub-section.
  const shown = current && !current.root ? current : null;

  // Recompute panel position. The panel is portalled into <body> with
  // position: fixed so an overflow:hidden ancestor (like the horizontally
  // scrolling tab row) can't clip it.
  const updateCoords = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateCoords();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 transition-colors py-1 px-1.5 -mx-1.5 rounded-md hover:bg-gray-100"
      >
        <span className={current ? "font-medium" : "text-gray-400"}>
          {/* The prefix only makes sense in front of a matched SUB-section. With
              no match the label falls back to `placeholder`, which is the
              section's own name — so rendering the prefix too printed
              "Notes › Notes" on every page outside that section, and the same
              on the section's own landing page once it joined the menu. */}
          {prefix && shown && (
            <>
              {prefix}
              <span className="text-gray-300 mx-1">›</span>
            </>
          )}
          {shown?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
            }}
            className="w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999]"
          >
            {sections.map((section) => {
              const active = current?.href === section.href;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    active
                      ? "text-gray-900 font-medium bg-gray-50"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {section.label}
                  {active && <Check className="w-3.5 h-3.5 text-gray-900" />}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
