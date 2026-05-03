"use client";

import { useState, useEffect, useRef } from "react";
import { Layers, Check, Plus, Loader2 } from "lucide-react";
import Link from "next/link";

interface Theme {
  id: number;
  name: string;
  tickers: string[];
}

interface AddToThemeButtonProps {
  ticker: string;
  variant?: "button" | "menuItem";
  onClose?: () => void;
}

export function AddToThemeButton({ ticker, variant = "button", onClose }: AddToThemeButtonProps) {
  const [open, setOpen] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fetchThemes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/themes");
      if (res.ok) {
        const data = await res.json();
        setThemes(data.themes || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    fetchThemes();
  };

  const handleAddToTheme = async (themeId: number) => {
    setAdding(themeId);
    try {
      const theme = themes.find((t) => t.id === themeId);
      if (!theme) return;

      // Add ticker to theme's tickers if not already present
      const currentTickers = theme.tickers || [];
      if (currentTickers.includes(ticker.toUpperCase())) {
        // Already in theme
        setAdding(null);
        setOpen(false);
        onClose?.();
        return;
      }

      const newTickers = [...currentTickers, ticker.toUpperCase()];

      const res = await fetch(`/api/themes/${themeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: newTickers }),
      });

      if (res.ok) {
        // Update local state to show checkmark
        setThemes((prev) =>
          prev.map((t) =>
            t.id === themeId ? { ...t, tickers: newTickers } : t
          )
        );
      }
    } catch {
      // Ignore errors
    } finally {
      setAdding(null);
    }
  };

  const isInTheme = (theme: Theme) =>
    (theme.tickers || []).map((t) => t.toUpperCase()).includes(ticker.toUpperCase());

  if (variant === "menuItem") {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={handleOpen}
          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Layers className="w-4 h-4" />
          Add to Theme
        </button>
        {open && (
          <div className="absolute right-full top-0 mr-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              </div>
            ) : themes.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                <p className="mb-2">No themes yet</p>
                <Link
                  href="/markets/themes"
                  className="text-emerald-600 hover:underline"
                  onClick={() => {
                    setOpen(false);
                    onClose?.();
                  }}
                >
                  Create a theme →
                </Link>
              </div>
            ) : (
              <>
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleAddToTheme(theme.id)}
                    disabled={adding === theme.id}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2 disabled:opacity-50"
                  >
                    <span className="truncate">{theme.name}</span>
                    {adding === theme.id ? (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                    ) : isInTheme(theme) ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Plus className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        title="Add to investment theme"
      >
        <Layers className="w-4 h-4" />
        <span>Theme</span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            </div>
          ) : themes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              <p className="mb-2">No themes yet</p>
              <Link
                href="/markets/themes"
                className="text-emerald-600 hover:underline"
                onClick={() => setOpen(false)}
              >
                Create a theme →
              </Link>
            </div>
          ) : (
            <>
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Add {ticker} to:
              </p>
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleAddToTheme(theme.id)}
                  disabled={adding === theme.id}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <span className="truncate">{theme.name}</span>
                  {adding === theme.id ? (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                  ) : isInTheme(theme) ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Plus className="w-3 h-3 text-gray-400" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
