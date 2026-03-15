"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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

type ModalSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, size = "md", children }: ModalProps) {
  const isMobile = useIsMobile();

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[9999]">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white border-t border-gray-200 animate-slide-up max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            {title && (
              <h3 className="text-sm font-semibold text-gray-900 mt-2">
                {title}
              </h3>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 mt-2 ml-auto"
            >
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto p-4 flex-1">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className={`relative bg-white border border-gray-200 rounded-xl shadow-2xl ${SIZE_CLASSES[size]} w-full mx-4 max-h-[80vh] flex flex-col animate-fade-in`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          {title && (
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 ml-auto"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
