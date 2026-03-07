"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import * as HoverCard from "@radix-ui/react-hover-card";
import { X } from "lucide-react";

interface Range {
  label: string;
  min: number | null;
  max: number | null;
  meaning: string;
  marketImpact?: string;
}

interface RangePopoverProps {
  ranges: Range[];
  currentLabel: string | null;
  unit?: string;
  children: React.ReactNode;
}

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    Healthy: "bg-emerald-100 text-emerald-700",
    Normal: "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    Expansion: "bg-emerald-100 text-emerald-700",
    Balanced: "bg-emerald-100 text-emerald-700",
    "Low Positive": "bg-emerald-100 text-emerald-700",
    Surplus: "bg-emerald-100 text-emerald-700",
    Accommodative: "bg-blue-100 text-blue-700",
    Neutral: "bg-gray-200 text-gray-700",
    Moderate: "bg-gray-200 text-gray-700",
    Low: "bg-blue-100 text-blue-700",
    Negative: "bg-amber-100 text-amber-700",
    "Above Target": "bg-amber-100 text-amber-700",
    Elevated: "bg-amber-100 text-amber-700",
    Softening: "bg-amber-100 text-amber-700",
    Restrictive: "bg-amber-100 text-amber-700",
    Inverted: "bg-amber-100 text-amber-700",
    Contraction: "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
    Critical: "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Negative": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    Crisis: "bg-red-100 text-red-700",
    "Crisis/ZIRP": "bg-red-100 text-red-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

function formatBound(value: number | null, unit?: string): string {
  if (value === null) return "";
  const suffix = unit === "%" || unit === "% YoY" ? "%" : unit === "bps" ? "bp" : "";
  return `${value}${suffix}`;
}

function formatRange(min: number | null, max: number | null, unit?: string): string {
  if (min === null && max === null) return "—";
  if (min === null) return `< ${formatBound(max, unit)}`;
  if (max === null) return `${formatBound(min, unit)}+`;
  return `${formatBound(min, unit)} – ${formatBound(max, unit)}`;
}

function RangeContent({ ranges, currentLabel, unit }: { ranges: Range[]; currentLabel: string | null; unit?: string }) {
  return (
    <div className="space-y-1">
      {ranges.map((range, idx) => {
        const isCurrent = currentLabel === range.label;
        return (
          <div
            key={idx}
            className={`px-2 py-1.5 rounded text-xs ${
              isCurrent
                ? getStatusColor(range.label) + " ring-1 ring-gray-300"
                : "text-gray-600"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`font-medium shrink-0 ${isCurrent ? "" : "text-gray-900"}`}>
                {range.label}
              </span>
              <span className="text-gray-400 shrink-0 tabular-nums">
                {formatRange(range.min, range.max, unit)}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] leading-snug opacity-80">{range.meaning}</div>
          </div>
        );
      })}
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function RangePopover({ ranges, currentLabel, unit, children }: RangePopoverProps) {
  const [showSheet, setShowSheet] = useState(false);
  const isMobile = useIsMobile();

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (showSheet) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [showSheet]);

  // Close bottom sheet on escape
  useEffect(() => {
    if (!showSheet) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowSheet(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showSheet]);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className="cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowSheet(true);
          }}
        >
          {children}
        </button>

        {showSheet && createPortal(
          <div className="fixed inset-0 z-[9999]" onClick={() => setShowSheet(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 pb-8 max-h-[70vh] overflow-y-auto animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Interpretation Guide
                </span>
                <button onClick={() => setShowSheet(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <RangeContent ranges={ranges} currentLabel={currentLabel} unit={unit} />
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <HoverCard.Root openDelay={150} closeDelay={200}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          className="cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {children}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-[9999] w-[340px] bg-white border border-gray-200 rounded-lg shadow-lg p-3 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2"
        >
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Interpretation Guide
          </div>
          <RangeContent ranges={ranges} currentLabel={currentLabel} unit={unit} />
          <HoverCard.Arrow className="fill-white" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
