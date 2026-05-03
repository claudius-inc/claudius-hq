"use client";

import { useState, useEffect } from "react";

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setProgress(Math.min(100, (scrollTop / docHeight) * 100));
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="h-[3px] bg-gray-200 w-full">
      <div
        className="h-full bg-gray-400 transition-[width] duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
