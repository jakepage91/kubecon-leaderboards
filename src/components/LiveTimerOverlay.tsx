"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatMs } from "@/lib/format";
import type { Route } from "@/lib/types";

interface TimerPayload {
  player_name: string;
  route: Route;
  state: "running" | "idle";
  elapsed_ms: number;
}

export function LiveTimerOverlay({ route }: { route: Route }) {
  const [visible, setVisible] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [displayMs, setDisplayMs] = useState(0);

  // Track the last broadcast for local interpolation
  const lastBroadcastRef = useRef<{ elapsed_ms: number; receivedAt: number } | null>(null);
  const rafRef = useRef(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Local rAF loop to interpolate between broadcast ticks
  const startInterpolation = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const last = lastBroadcastRef.current;
      if (last) {
        const delta = performance.now() - last.receivedAt;
        setDisplayMs(last.elapsed_ms + Math.floor(delta));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopInterpolation = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    lastBroadcastRef.current = null;
  }, []);

  // Reset the auto-hide timeout (hides after 3s of no broadcasts)
  const resetHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      stopInterpolation();
    }, 3000);
  }, [stopInterpolation]);

  useEffect(() => {
    const channel = supabase
      .channel("timer")
      .on("broadcast", { event: "tick" }, ({ payload }: { payload: TimerPayload }) => {
        if (payload.route !== route) return;

        if (payload.state === "running") {
          setPlayerName(payload.player_name);
          setDisplayMs(payload.elapsed_ms);
          lastBroadcastRef.current = {
            elapsed_ms: payload.elapsed_ms,
            receivedAt: performance.now(),
          };
          if (!visible) {
            setVisible(true);
            startInterpolation();
          }
          resetHideTimeout();
        } else {
          // idle — hide overlay
          setVisible(false);
          stopInterpolation();
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      cancelAnimationFrame(rafRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  if (!visible) return null;

  const colorClass = route === "legacy"
    ? "from-red-700 to-red-900 border-red-500/50"
    : "from-indigo-700 to-indigo-900 border-indigo-400/50";

  return (
    <div className={`fixed bottom-20 right-6 lg:right-10 z-30 bg-gradient-to-br ${colorClass} border-2 rounded-2xl px-6 py-4 shadow-2xl`}>
      <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1"
        style={{ fontFamily: "'Oswald', sans-serif" }}>
        Now Playing
      </p>
      <p className="text-white text-lg lg:text-xl font-bold truncate max-w-[200px]"
        style={{ fontFamily: "'Oswald', sans-serif" }}>
        {playerName}
      </p>
      <p className="text-3xl lg:text-4xl font-bold font-mono text-emerald-400 tabular-nums mt-1">
        {formatMs(displayMs)}
      </p>
    </div>
  );
}
