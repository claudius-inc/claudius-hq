"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddTickerModal } from "./AddTickerModal";

export function AddTickerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>Add ticker</span>
      </button>
      <AddTickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
