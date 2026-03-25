"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { formatMs } from "@/lib/format";
import { AdminRunsTable } from "@/components/AdminRunsTable";
import type { Route } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// ─── Toast ───────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: "success" | "error"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-semibold shadow-lg text-sm ${
      type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
    }`}>
      {message}
    </div>
  );
}

// ─── Login Form (Google OAuth) ───────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: { hd: "metalbear.com" },
      },
    });
    setLoading(false);
    if (authError) setError(authError.message);
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          const email = session.user.email ?? "";
          if (!email.endsWith("@metalbear.com")) {
            await supabase.auth.signOut();
            setError("Only @metalbear.com accounts are allowed.");
            return;
          }
          onLogin();
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#5B6AC9] border border-[#7B8AD9] rounded-2xl p-6">
        <div className="flex justify-center mb-4">
          <img src="/images/Golfer.png" alt="MetalBear Golfer" className="h-20 w-auto" />
        </div>
        <h1 className="text-2xl font-bold text-center mb-6 text-white">Staff Login</h1>
        {error && <p className="text-red-200 text-sm text-center mb-4">{error}</p>}
        <button onClick={handleGoogleLogin} disabled={loading}
          className="w-full py-2.5 bg-white hover:bg-gray-100 text-[#5B6AC9] disabled:opacity-50 rounded-lg font-semibold transition-colors">
          {loading ? "Redirecting..." : "Sign in with Google"}
        </button>
        <p className="text-white/60 text-xs text-center mt-3">
          Restricted to @metalbear.com accounts
        </p>
      </div>
    </div>
  );
}

// ─── Timer-based Entry Flow ──────────────────────────────────
type Phase = "setup" | "running" | "stopped";

// ─── CSV Backup Helper ──────────────────────────────────────
function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = String(r[c] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(",")
  ).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EntryForm({ user }: { user: User }) {
  const [route, setRoute] = useState<Route>("legacy");
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [legacyDone, setLegacyDone] = useState(false);

  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const timerChannelRef = useRef(supabase.channel("timer"));
  const lastBroadcastRef = useRef(0);

  // Subscribe to timer broadcast channel on mount
  useEffect(() => {
    timerChannelRef.current.subscribe();
    return () => { supabase.removeChannel(timerChannelRef.current); };
  }, []);

  function broadcastTimer(state: "running" | "idle", ms: number) {
    timerChannelRef.current.send({
      type: "broadcast",
      event: "tick",
      payload: { player_name: playerName, route, state, elapsed_ms: ms },
    });
  }

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Live timer tick via setInterval (survives tab backgrounding)
  function startTimer() {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    lastBroadcastRef.current = 0;

    // RAF for smooth local display
    const tickRaf = () => {
      const ms = Math.floor(Date.now() - startTimeRef.current);
      setElapsedMs(ms);
      rafRef.current = requestAnimationFrame(tickRaf);
    };
    rafRef.current = requestAnimationFrame(tickRaf);

    // setInterval for reliable broadcast (not throttled when tab is backgrounded)
    intervalRef.current = setInterval(() => {
      const ms = Math.floor(Date.now() - startTimeRef.current);
      broadcastTimer("running", ms);
    }, 200);

    setPhase("running");
  }

  function stopTimer() {
    cancelAnimationFrame(rafRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    const final = Math.floor(Date.now() - startTimeRef.current);
    setElapsedMs(final);
    broadcastTimer("idle", final);
    setPhase("stopped");
  }

  function resetForm(keepPlayer = false) {
    cancelAnimationFrame(rafRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    broadcastTimer("idle", 0);
    if (!keepPlayer) {
      setPlayerName("");
      setEmail("");
      setRoute("legacy");
      setLegacyDone(false);
    }
    setElapsedMs(0);
    setPhase("setup");
  }

  async function handleSubmit() {
    if (!playerName.trim()) {
      setToast({ message: "Player name is required", type: "error" });
      return;
    }
    if (elapsedMs <= 0 || elapsedMs > 240000) {
      setToast({ message: "Time must be between 0 and 4:00.000", type: "error" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("runs").insert({
      route,
      player_name: playerName.trim(),
      email: email.trim() || null,
      elapsed_ms: elapsedMs,
      created_by: user.id,
    });
    setSubmitting(false);

    if (error) {
      setToast({ message: error.message, type: "error" });
    } else if (route === "legacy") {
      // Legacy done — advance to mirrord with same player
      setToast({ message: `${playerName.trim()} Legacy done! Now mirrord Fast Lane.`, type: "success" });
      setLegacyDone(true);
      setRoute("mirrord");
      setElapsedMs(0);
      cancelAnimationFrame(rafRef.current);
      setPhase("setup");
    } else {
      // mirrord done — fully reset for next player
      setToast({ message: `${playerName.trim()} complete! Both runs recorded.`, type: "success" });
      resetForm();
    }
  }

  async function handleResetDay() {
    setShowResetConfirm(false);
    const { error } = await supabase
      .from("runs").update({ archived: true })
      .eq("archived", false);
    if (error) setToast({ message: `Reset failed: ${error.message}`, type: "error" });
    else setToast({ message: "Leaderboard reset!", type: "success" });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  // ── Download CSV backup ──
  const downloadBackup = useCallback(async () => {
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("archived", false)
      .order("score_ms", { ascending: true });
    if (error || !data || data.length === 0) {
      setToast({ message: data?.length === 0 ? "No runs to backup" : `Backup failed: ${error?.message}`, type: "error" });
      return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(data, `kubecon-leaderboard-${dateStr}-${Date.now()}.csv`);
    setToast({ message: `Backup downloaded (${data.length} runs)`, type: "success" });
  }, []);

  return (
    <div className="min-h-screen p-4 pb-40 max-w-lg mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Reset Day Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowResetConfirm(false)}>
          <div className="w-full max-w-sm bg-gray-900 border-2 border-red-600 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">&#9888;&#65039;</div>
              <h2 className="text-xl font-bold text-red-400" style={{ fontFamily: "'Dela Gothic One', cursive" }}>
                WARNING
              </h2>
            </div>
            <p className="text-center text-gray-300 mb-2">
              Do you really want to clear the entire leaderboard?
            </p>
            <p className="text-center text-gray-500 text-xs mb-6">
              All runs (all days) will be archived. This cannot be undone from the admin panel.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowResetConfirm(false)}
                className="py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors">
                Cancel
              </button>
              <button onClick={handleResetDay}
                className="py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors">
                Yes, Clear It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ fontFamily: "'Dela Gothic One', cursive" }}>Score Entry</h1>
        <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white transition-colors">
          Sign Out
        </button>
      </div>

      {/* ── PHASE: SETUP ── */}
      {phase === "setup" && (
        <div className="space-y-5">
          {/* Stage indicator */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`py-3 rounded-xl font-bold text-sm text-center transition-all ${
              route === "legacy"
                ? "bg-red-600 text-white ring-2 ring-red-400"
                : legacyDone
                  ? "bg-red-600/20 text-red-300 ring-1 ring-red-800 line-through"
                  : "bg-gray-800 text-gray-500"
            }`}>
              {legacyDone ? "Legacy Done" : "1. Legacy Dev Loop"}
            </div>
            <div className={`py-3 rounded-xl font-bold text-sm text-center transition-all ${
              route === "mirrord"
                ? "bg-violet-600 text-white ring-2 ring-violet-400"
                : "bg-gray-800 text-gray-500"
            }`}>
              2. mirrord Fast Lane
            </div>
          </div>

          {/* Player Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Player Name *</label>
            <input type="text" required value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              readOnly={legacyDone}
              className={`w-full px-3 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-lg focus:outline-none focus:ring-2 focus:ring-violet-500 ${legacyDone ? "opacity-60" : ""}`}
              placeholder="e.g. Jane D." autoComplete="off" />
          </div>

          {/* Email (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email (optional)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              readOnly={legacyDone}
              className={`w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ${legacyDone ? "opacity-60" : ""}`}
              placeholder="player@company.com" autoComplete="off" />
          </div>

          {/* GO Button */}
          <button type="button" onClick={() => {
            if (!playerName.trim()) { setToast({ message: "Enter player name first", type: "error" }); return; }
            startTimer();
          }}
            className="w-full py-5 rounded-2xl font-black text-3xl transition-colors tracking-wider bg-violet-600 hover:bg-violet-500 text-white"
            style={{ fontFamily: "'Alfa Slab One', serif" }}>
            GO!
          </button>

          {/* Skip / New Player shortcut when on mirrord stage */}
          {legacyDone && (
            <button type="button" onClick={() => resetForm()}
              className="w-full py-2 text-gray-500 text-sm hover:text-white transition-colors">
              Skip mirrord / Start new player
            </button>
          )}
        </div>
      )}

      {/* ── PHASE: RUNNING ── */}
      {phase === "running" && (
        <div className="flex flex-col items-center gap-6 pt-4">
          <p className="text-gray-400 text-sm">
            Timing: <span className="text-white font-bold">{playerName}</span>
          </p>

          {/* Big live timer */}
          <div className="w-full bg-gray-900 border-2 border-gray-600 rounded-2xl py-8 text-center">
            <p className="text-6xl font-bold font-mono text-emerald-400 tabular-nums">
              {formatMs(elapsedMs)}
            </p>
          </div>

          {/* STOP Button */}
          <button type="button" onClick={stopTimer}
            className="w-full py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-3xl transition-colors tracking-wider"
            style={{ fontFamily: "'Alfa Slab One', serif" }}>
            STOP
          </button>

          <button type="button" onClick={() => resetForm()} className="text-gray-500 text-sm hover:text-white transition-colors">
            Cancel &amp; Reset
          </button>
        </div>
      )}

      {/* ── PHASE: STOPPED ── */}
      {phase === "stopped" && (
        <div className="flex flex-col items-center gap-5 pt-4">
          <p className="text-gray-400 text-sm">
            <span className="text-white font-bold">{playerName}</span> — Time recorded
          </p>

          {/* Frozen timer display */}
          <div className="w-full bg-gray-900 border-2 border-yellow-500/50 rounded-2xl py-6 text-center">
            <p className="text-5xl font-bold font-mono text-yellow-400 tabular-nums">
              {formatMs(elapsedMs)}
            </p>
          </div>

          {/* Submit */}
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-2xl font-black text-2xl transition-colors tracking-wider"
            style={{ fontFamily: "'Alfa Slab One', serif" }}>
            {submitting ? "Saving..." : "Submit Score"}
          </button>

          <div className="flex w-full gap-3">
            <button type="button" onClick={() => resetForm()}
              className="flex-1 text-gray-500 text-sm hover:text-white transition-colors">
              Redo
            </button>
            <button type="button" onClick={() => {
              if (route === "legacy") {
                // Legacy disqualified — advance to mirrord with same player
                setToast({ message: `${playerName.trim()} disqualified from Legacy! Now mirrord Fast Lane.`, type: "error" });
                setLegacyDone(true);
                setRoute("mirrord");
                setElapsedMs(0);
                setPhase("setup");
              } else {
                setToast({ message: `${playerName.trim()} disqualified!`, type: "error" });
                resetForm();
              }
            }}
              className="flex-1 py-3 bg-red-800 hover:bg-red-700 border border-red-600 rounded-xl font-bold text-red-200 transition-colors text-sm tracking-wide">
              Disqualify
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Entries ── */}
      <AdminRunsTable userId={user.id} onToast={handleToast} />

      {/* ── Fixed bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 p-4 z-40">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2">
            <button onClick={downloadBackup}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl font-semibold text-gray-300 transition-colors text-sm">
              Download Backup (CSV)
            </button>
            <button onClick={() => setShowResetConfirm(true)}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-red-900/50 border border-red-800/50 rounded-xl font-semibold text-red-400 transition-colors text-sm">
              Reset Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Page (root) ───────────────────────────────────────
export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <LoginForm onLogin={checkSession} />;
  return <EntryForm user={user} />;
}
