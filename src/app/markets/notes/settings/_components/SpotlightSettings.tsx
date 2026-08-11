"use client";

import { useState } from "react";
import useSWR from "swr";
// Rows always render from this constant — only the toggle is skeletonised
// inline — so the list height is identical before and after data arrives.
import { SPOTLIGHT_SECTOR_META } from "../_lib/sectors";

interface SpotlightRow {
  sector: string;
  enabled: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  // Without this an auth/500 response renders as a silent all-off state.
  if (!res.ok) throw new Error(`Failed to load spotlight config (${res.status})`);
  return res.json();
};

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-100 last:border-0 min-h-[56px]">
      {children}
    </li>
  );
}

export function SpotlightSettings() {
  const { data, error, isLoading, mutate } = useSWR<{ sectors: SpotlightRow[] }>(
    "/api/notes/spotlight",
    fetcher,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function toggle(sector: string, next: boolean) {
    setSaving(sector);
    setSaveError(null);
    // Optimistic: the toggle should feel instant, and the PATCH returns truth.
    mutate(
      (cur) =>
        cur
          ? { sectors: cur.sectors.map((s) => (s.sector === sector ? { ...s, enabled: next } : s)) }
          : cur,
      false,
    );
    try {
      const res = await fetch("/api/notes/spotlight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, enabled: next }),
      });
      // Without this the optimistic toggle silently reverts on the revalidate
      // and the user never learns the write failed.
      if (!res.ok) setSaveError(`Couldn't save ${sector} (${res.status}).`);
    } catch {
      setSaveError(`Couldn't save ${sector}.`);
    } finally {
      setSaving(null);
      mutate();
    }
  }

  const enabledBySector = new Map((data?.sectors ?? []).map((s) => [s.sector, s.enabled]));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {error && (
        <p className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          Couldn&apos;t load spotlight settings. Toggles below may not reflect the saved state.
        </p>
      )}
      {saveError && (
        <p className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">{saveError}</p>
      )}
      <ul>
        {SPOTLIGHT_SECTOR_META.map((meta) => {
          const enabled = enabledBySector.get(meta.sector) ?? false;
          return (
            <Row key={meta.sector}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{meta.label}</p>
                <p className="text-xs text-gray-500 font-mono">{meta.sector}</p>
              </div>

              {isLoading ? (
                <div className="h-6 w-11 rounded-full bg-gray-100 animate-pulse shrink-0" />
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Spotlight ${meta.label}`}
                  disabled={saving === meta.sector}
                  onClick={() => toggle(meta.sector, !enabled)}
                  className={`relative h-6 w-11 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                    enabled ? "bg-gray-900" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      enabled ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              )}
            </Row>
          );
        })}
      </ul>
    </div>
  );
}
