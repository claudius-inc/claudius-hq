"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

interface PageHeroAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}

interface PageHeroProps {
  title: string;
  subtitle?: string;
  /** Optional badge / status pill shown next to subtitle */
  badge?: ReactNode;
  /** Action buttons — shown inline on desktop, collapsed into ··· menu on mobile */
  actions?: PageHeroAction[];
  /** Fully custom action area (overrides actions array) — you handle responsive yourself */
  actionSlot?: ReactNode;
}

const variantClasses: Record<string, string> = {
  default:
    "text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50",
  primary:
    "text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50",
  danger:
    "text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-50",
};

export function PageHero({
  title,
  subtitle,
  badge,
  actions,
  actionSlot,
}: PageHeroProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasActions = actions && actions.length > 0;

  return (
    <div className="mb-6 pt-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {title}
          </h1>
          {(subtitle || badge) && (
            <div className="flex items-center gap-2 mt-1">
              {subtitle && (
                <p className="text-sm text-gray-500">{subtitle}</p>
              )}
              {badge}
            </div>
          )}
        </div>

        {/* Desktop: inline buttons */}
        {hasActions && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  variantClasses[action.variant || "default"]
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: ··· menu */}
        {hasActions && (
          <div className="sm:hidden relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-gray-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      action.onClick();
                      setMenuOpen(false);
                    }}
                    disabled={action.disabled}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      action.variant === "danger"
                        ? "text-red-600 hover:bg-red-50"
                        : "text-gray-700 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Custom action slot */}
        {actionSlot && !hasActions && actionSlot}
      </div>
    </div>
  );
}
