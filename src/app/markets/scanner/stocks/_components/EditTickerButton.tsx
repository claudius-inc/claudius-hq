"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditTickerModal } from "./EditTickerModal";

interface EditTickerButtonProps {
  ticker: string;
  /** "icon" = compact pencil, "labeled" = pencil + "Edit" text. */
  variant?: "icon" | "labeled";
  className?: string;
}

export function EditTickerButton({
  ticker,
  variant = "icon",
  className = "",
}: EditTickerButtonProps) {
  const [open, setOpen] = useState(false);

  const baseCls =
    variant === "labeled"
      ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-colors"
      : "inline-flex items-center justify-center p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`${baseCls} ${className}`}
        title={`Edit ${ticker}`}
        aria-label={`Edit ${ticker}`}
      >
        <Pencil className={variant === "labeled" ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} />
        {variant === "labeled" && <span>Edit</span>}
      </button>
      <EditTickerModal
        open={open}
        ticker={ticker}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
