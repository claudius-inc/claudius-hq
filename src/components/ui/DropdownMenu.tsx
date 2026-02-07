"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}

export function DropdownMenu({ trigger, children, align = "left" }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && (
        <div
          className={`absolute z-50 mt-2 min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
}

export function DropdownItem({ children, onClick, className = "", danger = false }: DropdownItemProps) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-gray-700 hover:bg-gray-50"
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface DropdownDividerProps {
  className?: string;
}

export function DropdownDivider({ className = "" }: DropdownDividerProps) {
  return <div className={`border-t border-gray-100 my-1 ${className}`} />;
}
