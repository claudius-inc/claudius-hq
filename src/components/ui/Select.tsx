"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = "Select...", className = "" }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between gap-2 w-full
          px-3 py-1.5 text-sm
          bg-white border rounded-lg
          transition-colors
          ${isOpen 
            ? "border-emerald-500 ring-2 ring-emerald-500/20" 
            : "border-gray-300 hover:border-gray-400"
          }
          focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
        `}
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-500"}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown 
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} 
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`
                flex items-center justify-between gap-2
                px-3 py-2 text-sm cursor-pointer
                transition-colors
                ${option.value === value 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <Check className="w-4 h-4 text-emerald-600" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
