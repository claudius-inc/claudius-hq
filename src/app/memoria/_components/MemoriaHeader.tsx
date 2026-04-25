"use client";

import { Search, Plus, Shuffle } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddClick: () => void;
  onRandomClick: () => void;
  total: number;
}

export function MemoriaHeader({ searchQuery, onSearchChange, onAddClick, onRandomClick, total }: Props) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onSearchChange(localQuery);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [localQuery, onSearchChange]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-xl font-bold text-gray-900">Memoria</h1>
      <div className="flex-1 min-w-[200px] relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={`Search ${total} entries...`}
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <button
        onClick={onRandomClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
      >
        <Shuffle size={14} />
        Random
      </button>
      <button
        onClick={onAddClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
