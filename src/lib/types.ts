export type Route = "legacy" | "mirrord";

export interface Run {
  id: string;
  event_day: string;
  route: Route;
  player_name: string;
  email: string | null;
  elapsed_ms: number;
  score_ms: number;
  archived: boolean;
  created_at: string;
  created_by: string | null;
  modified_by: string | null;
  modified_at: string | null;
}
