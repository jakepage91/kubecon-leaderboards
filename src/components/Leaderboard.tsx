"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase";
import { formatMs } from "@/lib/format";
import type { Run, Route } from "@/lib/types";

const ROUTE_META: Record<Route, { label: string; colorClass: string }> = {
  legacy: { label: "Legacy Dev Loop", colorClass: "scoreboard-legacy" },
  mirrord: { label: "mirrord Fast Lane", colorClass: "scoreboard-mirrord" },
};

const PRIMARY_ROWS = 15;

// ── Live timer types ──────────────────────────────────────
interface TimerPayload {
  player_name: string;
  route: Route;
  state: "running" | "idle";
  elapsed_ms: number;
}

interface LiveTimerState {
  visible: boolean;
  playerName: string;
  displayMs: number;
}

// ── Single subscription for both routes ──────────────────
export function useLiveTimers(): Record<Route, LiveTimerState> {
  const [timers, setTimers] = useState<Record<Route, LiveTimerState>>({
    legacy: { visible: false, playerName: "", displayMs: 0 },
    mirrord: { visible: false, playerName: "", displayMs: 0 },
  });

  const lastBroadcastRef = useRef<Record<Route, { elapsed_ms: number; receivedAt: number } | null>>({
    legacy: null,
    mirrord: null,
  });
  const rafRef = useRef(0);
  const hideTimeoutsRef = useRef<Partial<Record<Route, NodeJS.Timeout>>>({});

  // RAF interpolation
  useEffect(() => {
    const tick = () => {
      const legacy = lastBroadcastRef.current.legacy;
      const mirrord = lastBroadcastRef.current.mirrord;
      if (legacy || mirrord) {
        setTimers(prev => ({
          legacy: legacy
            ? { ...prev.legacy, displayMs: legacy.elapsed_ms + Math.floor(performance.now() - legacy.receivedAt) }
            : prev.legacy,
          mirrord: mirrord
            ? { ...prev.mirrord, displayMs: mirrord.elapsed_ms + Math.floor(performance.now() - mirrord.receivedAt) }
            : prev.mirrord,
        }));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Single Supabase Realtime broadcast subscription for both routes
  useEffect(() => {
    const channel = supabase
      .channel("timer")
      .on("broadcast", { event: "tick" }, ({ payload }: { payload: TimerPayload }) => {
        const route = payload.route;
        if (payload.state === "running") {
          lastBroadcastRef.current[route] = {
            elapsed_ms: payload.elapsed_ms,
            receivedAt: performance.now(),
          };
          setTimers(prev => ({
            ...prev,
            [route]: { ...prev[route], visible: true, playerName: payload.player_name },
          }));
          if (hideTimeoutsRef.current[route]) clearTimeout(hideTimeoutsRef.current[route]);
          hideTimeoutsRef.current[route] = setTimeout(() => {
            lastBroadcastRef.current[route] = null;
            setTimers(prev => ({ ...prev, [route]: { ...prev[route], visible: false } }));
          }, 3000);
        } else {
          lastBroadcastRef.current[route] = null;
          setTimers(prev => ({ ...prev, [route]: { ...prev[route], visible: false } }));
          if (hideTimeoutsRef.current[route]) clearTimeout(hideTimeoutsRef.current[route]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      cancelAnimationFrame(rafRef.current);
      Object.values(hideTimeoutsRef.current).forEach(t => t && clearTimeout(t));
    };
  }, []);

  return timers;
}

// ── Leaderboard data + confetti ───────────────────────────
function fireConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;
  const frame = () => {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.5 }, colors: ["#FFD700", "#FFA500", "#FFF", "#FF6347"] });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.5 }, colors: ["#FFD700", "#FFA500", "#FFF", "#FF6347"] });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

async function fetchLeaderboard(route: Route): Promise<Run[]> {
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("route", route)
    .eq("archived", false)
    .order("score_ms", { ascending: true })
    .limit(200);
  if (error) { console.error("Error fetching " + route + ":", error); return []; }
  return (data as Run[]) ?? [];
}

function padRows(runs: Run[], count: number): (Run | null)[] {
  const out: (Run | null)[] = [...runs];
  while (out.length < count) out.push(null);
  return out;
}

function RankCell({ run, index }: { run: Run | null; index: number }) {
  if (!run) return null;
  if (index === 0) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <img src="/images/golf-ball.png" alt="" className="h-3 lg:h-4 w-auto inline" />
        <span>{"\u{1F451}"}</span>
        <img src="/images/club.png" alt="" className="h-3 lg:h-4 w-auto inline" />
      </span>
    );
  }
  return <>{index + 1}</>;
}

function ScoreTable({
  rows, startIndex, showHeader, sz, newLeaderId,
}: {
  rows: (Run | null)[];
  startIndex: number;
  showHeader: boolean;
  sz: { head: string; cell: string; rank: string };
  newLeaderId: string | null;
}) {
  return (
    <table className="sb-table sb-table-compact" cellSpacing={0}>
      {showHeader && (
        <thead>
          <tr>
            <th className={"sb-cell sb-cell-rank " + sz.head}>#</th>
            <th className={"sb-cell sb-cell-player " + sz.head}>PLAYER</th>
            <th className={"sb-cell sb-cell-time " + sz.head}>TIME</th>
            <th className={"sb-cell sb-cell-strokes " + sz.head}>SW</th>
            <th className={"sb-cell sb-cell-score " + sz.head}>SCORE</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((run, i) => {
          const globalIndex = startIndex + i;
          const isNewLeader = run?.id === newLeaderId && globalIndex === 0;
          return (
            <tr key={run?.id ?? "empty-" + globalIndex}
              className={(globalIndex === 0 && run ? "sb-row-first" : "") + " " + (isNewLeader ? "new-leader-row" : "")}>
              <td className={"sb-cell sb-cell-rank " + sz.rank}>
                <RankCell run={run} index={globalIndex} />
              </td>
              <td className={"sb-cell sb-cell-player " + sz.cell}>{run?.player_name ?? ""}</td>
              <td className={"sb-cell sb-cell-time " + sz.cell}>{run ? formatMs(run.elapsed_ms) : ""}</td>
              <td className={"sb-cell sb-cell-strokes " + sz.cell}>{run ? run.strokes : ""}</td>
              <td className={"sb-cell sb-cell-score " + sz.cell}>{run ? formatMs(run.score_ms) : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LeaderboardPanel({
  route, runs, newLeaderId, liveTimer, fullscreen = false,
}: {
  route: Route;
  runs: Run[];
  newLeaderId: string | null;
  liveTimer?: LiveTimerState;
  fullscreen?: boolean;
}) {
  const meta = ROUTE_META[route];
  const primaryRows = padRows(runs.slice(0, PRIMARY_ROWS), PRIMARY_ROWS);
  const overflowRuns = runs.slice(PRIMARY_ROWS);

  const sz = fullscreen
    ? { title: "text-2xl lg:text-4xl", head: "text-[9px] lg:text-[11px]", cell: "text-[11px] lg:text-sm", rank: "text-xs lg:text-base" }
    : { title: "text-lg lg:text-2xl", head: "text-[8px] lg:text-[10px]", cell: "text-[10px] lg:text-xs", rank: "text-[10px] lg:text-sm" };

  return (
    <div className={"sb " + meta.colorClass + " flex-1 flex flex-col min-h-0"}>
      <div className="sb-badge">
        <div className="sb-badge-inner">
          <span className={sz.head}>LEADERBOARD</span>
        </div>
      </div>

      <h2 className={"sb-title " + sz.title}>{meta.label}</h2>

      {/* NOW PLAYING strip */}
      {liveTimer?.visible && (
        <div className="relative z-[1] mx-1 mb-2 flex items-center gap-3 bg-black/30 border border-white/25 rounded-lg px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-white/60 uppercase tracking-widest leading-none mb-0.5"
              style={{ fontFamily: "'Alfa Slab One', serif", fontSize: "clamp(7px, 1vw, 10px)" }}>
              ▶ Now Playing
            </p>
            <p className="text-white font-bold truncate"
              style={{ fontFamily: "'Oswald', sans-serif", fontSize: "clamp(12px, 2vw, 18px)" }}>
              {liveTimer.playerName}
            </p>
          </div>
          <p className="text-emerald-400 font-mono font-bold tabular-nums shrink-0"
            style={{ fontSize: "clamp(18px, 3vw, 30px)" }}>
            {formatMs(liveTimer.displayMs)}
          </p>
        </div>
      )}

      <div className="flex gap-1 lg:gap-2 flex-1 min-h-0 relative z-[1]">
        <div className="flex-1 min-w-0">
          <ScoreTable rows={primaryRows} startIndex={0} showHeader={true} sz={sz} newLeaderId={newLeaderId} />
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto sb-scroll">
          {overflowRuns.length > 0 ? (
            <ScoreTable rows={overflowRuns} startIndex={PRIMARY_ROWS} showHeader={true} sz={sz} newLeaderId={newLeaderId} />
          ) : (
            <ScoreTable rows={padRows([], PRIMARY_ROWS)} startIndex={PRIMARY_ROWS} showHeader={true} sz={sz} newLeaderId={newLeaderId} />
          )}
        </div>
      </div>
    </div>
  );
}

export function useLeaderboardRealtime(routes: Route[]) {
  const [data, setData] = useState<Record<Route, Run[]>>({ legacy: [], mirrord: [] });
  const [newLeaderId, setNewLeaderId] = useState<string | null>(null);
  const topIdsRef = useRef<Record<Route, string | null>>({ legacy: null, mirrord: null });
  const initialLoadDone = useRef(false);
  const leaderTimeout = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.all(routes.map((r) => fetchLeaderboard(r)));
    const newData = { ...data };
    routes.forEach((r, i) => { newData[r] = results[i]; });

    if (initialLoadDone.current) {
      let leader: string | null = null;
      for (const r of routes) {
        const newTop = newData[r][0]?.id ?? null;
        if (newTop && newTop !== topIdsRef.current[r]) leader = newTop;
      }
      if (leader) {
        fireConfetti();
        setNewLeaderId(leader);
        if (leaderTimeout.current) clearTimeout(leaderTimeout.current);
        leaderTimeout.current = setTimeout(() => setNewLeaderId(null), 5000);
      }
    }

    for (const r of routes) topIdsRef.current[r] = newData[r][0]?.id ?? null;
    initialLoadDone.current = true;
    setData(newData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes.join(",")]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("runs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); if (leaderTimeout.current) clearTimeout(leaderTimeout.current); };
  }, [refresh]);

  return { data, newLeaderId };
}
