"use client";

import { LeaderboardPanel, useLeaderboardRealtime, useLiveTimers } from "@/components/Leaderboard";
import { FullscreenButton } from "@/components/FullscreenButton";

export default function DisplayBothPage() {
  const { data, newLeaderId } = useLeaderboardRealtime(["legacy", "mirrord"]);
  const liveTimers = useLiveTimers();

  return (
    <main className="kiosk-mode h-screen w-screen flex flex-col p-4 lg:p-6 overflow-hidden select-none bg-white">
      <FullscreenButton />
      <div className="flex-1 flex gap-4 lg:gap-6 min-h-0">
        <LeaderboardPanel route="legacy" runs={data.legacy} newLeaderId={newLeaderId} liveTimer={liveTimers.legacy} />
        <LeaderboardPanel route="mirrord" runs={data.mirrord} newLeaderId={newLeaderId} liveTimer={liveTimers.mirrord} />
      </div>

      <footer className="flex items-center justify-center gap-3 mt-2 lg:mt-3 shrink-0">
        <p className="text-gray-300 text-[10px] lg:text-xs vintage-footer">
          Score = Fastest Time
        </p>
        <span className="text-gray-300 text-[10px] lg:text-xs">&bull;</span>
        <span className="text-gray-400 text-[10px] lg:text-xs vintage-footer">Powered by</span>
        <img src="/images/mirrord-logo.png" alt="mirrord by MetalBear" className="h-4 lg:h-5 w-auto opacity-70" />
      </footer>
    </main>
  );
}
