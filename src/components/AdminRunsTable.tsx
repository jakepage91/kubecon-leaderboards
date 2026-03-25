"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatMs } from "@/lib/format";
import type { Run, Route } from "@/lib/types";

interface AdminRunsTableProps {
  userId: string;
  onToast: (message: string, type: "success" | "error") => void;
}

export function AdminRunsTable({ userId, onToast }: AdminRunsTableProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRoute, setFilterRoute] = useState<Route | "all">("all");
  const [editingRun, setEditingRun] = useState<Run | null>(null);
  const [deletingRun, setDeletingRun] = useState<Run | null>(null);

  // ── Edit form state ──
  const [editName, setEditName] = useState("");
  const [editMinutes, setEditMinutes] = useState(0);
  const [editSeconds, setEditSeconds] = useState(0);
  const [editMillis, setEditMillis] = useState(0);
  const [editRoute, setEditRoute] = useState<Route>("legacy");
  const [editSaving, setEditSaving] = useState(false);

  // ── Fetch runs ──
  const fetchRuns = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("runs")
      .select("*")
      .eq("archived", false)
      .order("score_ms", { ascending: true });

    if (filterRoute !== "all") {
      query = query.eq("route", filterRoute);
    }

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      onToast(`Failed to load runs: ${error.message}`, "error");
      return;
    }
    setRuns((data as Run[]) ?? []);
  }, [filterRoute, onToast]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("admin-runs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => fetchRuns())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRuns]);

  // ── Open edit modal ──
  function openEdit(run: Run) {
    setEditingRun(run);
    setEditName(run.player_name);
    const totalSeconds = Math.floor(run.elapsed_ms / 1000);
    setEditMinutes(Math.floor(totalSeconds / 60));
    setEditSeconds(totalSeconds % 60);
    setEditMillis(run.elapsed_ms % 1000);
    setEditRoute(run.route);
  }

  // ── Save edit ──
  async function handleSaveEdit() {
    if (!editingRun) return;
    const newElapsedMs = editMinutes * 60000 + editSeconds * 1000 + editMillis;

    if (!editName.trim()) { onToast("Player name required", "error"); return; }
    if (newElapsedMs <= 0 || newElapsedMs > 240000) { onToast("Time must be 0–4:00.000", "error"); return; }
    setEditSaving(true);
    const { error } = await supabase
      .from("runs")
      .update({
        player_name: editName.trim(),
        elapsed_ms: newElapsedMs,
        route: editRoute,
        modified_by: userId,
        modified_at: new Date().toISOString(),
      })
      .eq("id", editingRun.id);
    setEditSaving(false);

    if (error) {
      onToast(`Edit failed: ${error.message}`, "error");
    } else {
      onToast(`Updated ${editName.trim()}`, "success");
      setEditingRun(null);
    }
  }

  // ── Delete (archive) ──
  async function handleDelete() {
    if (!deletingRun) return;
    const { error } = await supabase
      .from("runs")
      .update({
        archived: true,
        modified_by: userId,
        modified_at: new Date().toISOString(),
      })
      .eq("id", deletingRun.id);

    if (error) {
      onToast(`Delete failed: ${error.message}`, "error");
    } else {
      onToast(`Deleted ${deletingRun.player_name}`, "success");
      setDeletingRun(null);
    }
  }

  return (
    <div className="mt-8 mb-24">
      {/* Header + filter */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Dela Gothic One', cursive" }}>
          Manage Entries
        </h2>
        <div className="flex gap-1">
          {(["all", "legacy", "mirrord"] as const).map((r) => {
            const isActive = filterRoute === r;
            const activeClass = r === "legacy"
              ? "bg-red-600 text-white"
              : r === "mirrord"
                ? "bg-indigo-600 text-white"
                : "bg-gray-700 text-white";
            return (
              <button key={r} onClick={() => setFilterRoute(r)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  isActive ? activeClass : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                }`}>
                {r === "all" ? "All" : r === "legacy" ? "Legacy" : "mirrord"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No active runs</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-300">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500 text-xs bg-gray-100">
                <th className="py-2 px-2 text-left">#</th>
                <th className="py-2 px-2 text-left">Player</th>
                <th className="py-2 px-2 text-center">Route</th>
                <th className="py-2 px-2 text-right">Time</th>
                <th className="py-2 px-2 text-right">Time</th>
                <th className="py-2 px-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-2 text-gray-900 font-semibold truncate max-w-[120px]">{run.player_name}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      run.route === "legacy" ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600"
                    }`}>
                      {run.route}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-gray-700">{formatMs(run.elapsed_ms)}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(run)}
                      className="text-indigo-600 hover:text-indigo-500 text-xs font-semibold mr-3">
                      Edit
                    </button>
                    <button onClick={() => setDeletingRun(run)}
                      className="text-red-600 hover:text-red-500 text-xs font-semibold">
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditingRun(null)}>
          <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold" style={{ fontFamily: "'Dela Gothic One', cursive" }}>
              Edit Entry
            </h3>

            {/* Player name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Player Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>

            {/* Time — minutes : seconds . millis */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Time</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={4} value={editMinutes}
                  onChange={(e) => setEditMinutes(Math.max(0, Math.min(4, Number(e.target.value))))}
                  className="w-14 px-2 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <span className="text-gray-400 font-bold">:</span>
                <input type="number" min={0} max={59} value={editSeconds}
                  onChange={(e) => setEditSeconds(Math.max(0, Math.min(59, Number(e.target.value))))}
                  className="w-14 px-2 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <span className="text-gray-400 font-bold">.</span>
                <input type="number" min={0} max={999} value={editMillis}
                  onChange={(e) => setEditMillis(Math.max(0, Math.min(999, Number(e.target.value))))}
                  className="w-16 px-2 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">min : sec . ms</p>
            </div>

            {/* Route */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Route</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEditRoute("legacy")}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                    editRoute === "legacy" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"
                  }`}>
                  Legacy
                </button>
                <button onClick={() => setEditRoute("mirrord")}
                  className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                    editRoute === "mirrord" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400"
                  }`}>
                  mirrord
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setEditingRun(null)}
                className="py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={editSaving}
                className="py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-xl font-bold transition-colors">
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deletingRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeletingRun(null)}>
          <div className="w-full max-w-sm bg-gray-900 border-2 border-red-600 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-400 text-center mb-2"
              style={{ fontFamily: "'Dela Gothic One', cursive" }}>
              Delete Entry?
            </h3>
            <p className="text-center text-gray-300 mb-1">
              Remove <span className="font-bold text-white">{deletingRun.player_name}</span>&apos;s {deletingRun.route} run?
            </p>
            <p className="text-center text-gray-500 text-xs mb-5">
              Time: {formatMs(deletingRun.elapsed_ms)} &bull; This will archive the entry.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeletingRun(null)}
                className="py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
