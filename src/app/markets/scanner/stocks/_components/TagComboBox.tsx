"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import { X, Plus } from "lucide-react";

export interface ComboOption {
  /** Stable key — for tags use the lowercase tag, for themes use the id as string */
  value: string;
  /** Display label */
  label: string;
  /** Optional small hint shown after the label (e.g., "12 tickers") */
  hint?: string;
}

interface TagComboBoxProps {
  /** Currently selected option values */
  selected: string[];
  /** Called when selection changes */
  onChange: (values: string[]) => void;
  /** Async loader returning matching options for the current query */
  loadOptions: (query: string) => Promise<ComboOption[]>;
  /** When set, "Create <query>" appears as last option when no exact match. Receives the typed text. */
  onCreate?: (query: string) => void | Promise<void>;
  /** Map from value → label so chips render correctly */
  labels: Record<string, string>;
  placeholder?: string;
  /** Force-lowercase the query and disallow uppercase chips (true for tags). */
  lowerCase?: boolean;
  /** Optional aria-label for the input */
  ariaLabel?: string;
}

export function TagComboBox({
  selected,
  onChange,
  loadOptions,
  onCreate,
  labels,
  placeholder = "Search or create…",
  lowerCase = false,
  ariaLabel,
}: TagComboBoxProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = input.trim();
  const normalizedQuery = lowerCase ? trimmedQuery.toLowerCase() : trimmedQuery;

  const filteredOptions = useMemo(
    () => options.filter((o) => !selected.includes(o.value)),
    [options, selected],
  );

  const exactExists = useMemo(() => {
    if (!normalizedQuery) return false;
    return filteredOptions.some(
      (o) => o.label.toLowerCase() === normalizedQuery.toLowerCase(),
    );
  }, [filteredOptions, normalizedQuery]);

  const showCreateRow = !!onCreate && normalizedQuery.length > 0 && !exactExists;
  const totalRows = filteredOptions.length + (showCreateRow ? 1 : 0);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Debounced load
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await loadOptions(normalizedQuery);
        setOptions(next);
        setHighlight(0);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalizedQuery, open, loadOptions]);

  const removeAt = useCallback(
    (value: string) => {
      onChange(selected.filter((v) => v !== value));
    },
    [onChange, selected],
  );

  const selectOption = useCallback(
    (opt: ComboOption) => {
      if (selected.includes(opt.value)) return;
      onChange([...selected, opt.value]);
      setInput("");
      inputRef.current?.focus();
    },
    [onChange, selected],
  );

  const handleCreate = useCallback(async () => {
    if (!onCreate || !normalizedQuery) return;
    await onCreate(normalizedQuery);
    setInput("");
    inputRef.current?.focus();
  }, [normalizedQuery, onCreate]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (totalRows === 0 ? 0 : (h + 1) % totalRows));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (totalRows === 0 ? 0 : (h - 1 + totalRows) % totalRows));
    } else if (e.key === "Enter") {
      if (totalRows === 0 && !showCreateRow) return;
      e.preventDefault();
      if (highlight < filteredOptions.length) {
        selectOption(filteredOptions[highlight]);
      } else if (showCreateRow) {
        void handleCreate();
      }
    } else if (e.key === "Backspace" && input === "" && selected.length > 0) {
      e.preventDefault();
      removeAt(selected[selected.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[2.25rem] px-2 py-1.5 border border-gray-300 rounded-md bg-white focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:border-emerald-500"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-md border border-emerald-200"
          >
            {labels[value] ?? value}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(value);
              }}
              className="text-emerald-400 hover:text-emerald-700 transition-colors"
              aria-label={`Remove ${labels[value] ?? value}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) =>
            setInput(lowerCase ? e.target.value.toLowerCase() : e.target.value)
          }
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          aria-label={ariaLabel}
          className="flex-1 min-w-[6rem] outline-none text-sm bg-transparent"
        />
      </div>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
          )}
          {!loading && filteredOptions.length === 0 && !showCreateRow && (
            <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
          )}
          {!loading &&
            filteredOptions.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectOption(opt)}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 ${
                  highlight === idx ? "bg-emerald-50" : "hover:bg-gray-50"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {opt.hint && (
                  <span className="text-xs text-gray-400 shrink-0">{opt.hint}</span>
                )}
              </button>
            ))}
          {!loading && showCreateRow && (
            <button
              type="button"
              onMouseEnter={() => setHighlight(filteredOptions.length)}
              onClick={() => void handleCreate()}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-t border-gray-100 ${
                highlight === filteredOptions.length
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Create <span className="font-medium">&ldquo;{normalizedQuery}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
