"use client";

import { LeaderboardPanel, useLeaderboardRealtime } from "@/components/Leaderboard";
import { LiveTimerOverlay } from "@/components/LiveTimerOverlay";

export default function DisplayBothPage() {
  const { data, newLeaderId } = useLeaderboardRealtime(["legacy", "mirrord"]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="kiosk-mode h-screen w-screen flex flex-col p-4 lg:p-6 overflow-hidden select-none bg-white">
      <header className="flex items-center justify-center gap-3 lg:gap-5 mb-3 lg:mb-5 shrink-0">
        <img src="/images/Golfer.png" alt="MetalBear Golfer" className="h-14 lg:h-20 w-auto" />
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <img src="/images/golf-ball.png" alt="" className="h-4 lg:h-5 w-auto opacity-60" />
            <h1 className="page-title lg:text-5xl text-3xl">KubeCon Mini Golf</h1>
            <img src="/images/club.png" alt="" className="h-5 lg:h-7 w-auto opacity-60" />
          </div>
          <p className="text-gray-400 text-xs lg:text-sm mt-1 vintage-footer">{today}</p>
        </div>
        <img src="/images/Golfer.png" alt="" className="h-14 lg:h-20 w-auto -scale-x-100" />
      </header>

      <div className="flex-1 flex gap-4 lg:gap-6 min-h-0">
        <LeaderboardPanel route="legacy" runs={data.legacy} newLeaderId={newLeaderId} />
        <LeaderboardPanel route="mirrord" runs={data.mirrord} newLeaderId={newLeaderId} />
      </div>

      <LiveTimerOverlay route="legacy" />
      <LiveTimerOverlay route="mirrord" />

      <footer className="flex items-center justify-center gap-3 mt-2 lg:mt-3 shrink-0">
        <p className="text-gray-300 text-[10px] lg:text-xs vintage-footer">
          Score = Time + 5s per stroke
        </p>
        <span className="text-gray-300 text-[10px] lg:text-xs">&bull;</span>
        <span className="text-gray-400 text-[10px] lg:text-xs vintage-footer">Powered by</span>
        <img src="/images/mirrord-logo.png" alt="mirrord by MetalBear" className="h-4 lg:h-5 w-auto opacity-70" />
      </footer>
    </main>
  );
}
