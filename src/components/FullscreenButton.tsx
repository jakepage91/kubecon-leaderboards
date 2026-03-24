"use client";

import { useState, useEffect, useCallback } from "react";

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const update = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  useEffect(() => {
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [update]);

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  if (isFullscreen) return null;

  return (
    <button
      onClick={toggle}
      className="fixed top-3 right-3 z-50 bg-black/50 hover:bg-black/70 text-white/70 hover:text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-sm"
    >
      ⛶ Fullscreen
    </button>
  );
}
