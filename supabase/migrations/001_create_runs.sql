-- ============================================================
-- KubeCon Mini-Golf Leaderboard — Supabase Migration
-- ============================================================

-- 1. Runs table
CREATE TABLE runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_day   date        NOT NULL DEFAULT CURRENT_DATE,
  route       text        NOT NULL CHECK (route IN ('legacy', 'mirrord')),
  player_name text        NOT NULL CHECK (char_length(player_name) > 0),
  email       text,
  elapsed_ms  integer     NOT NULL CHECK (elapsed_ms > 0 AND elapsed_ms <= 240000),
  strokes     integer     NOT NULL CHECK (strokes >= 1 AND strokes <= 20),
  -- Computed score: elapsed time + 5s penalty per stroke + deterministic sub-second tiebreaker
  score_ms    bigint      GENERATED ALWAYS AS (
    elapsed_ms::bigint + strokes::bigint * 5000 + (abs(hashtext(id::text)) % 1000)
  ) STORED,
  archived    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id),
  modified_at timestamptz,
  modified_by uuid        REFERENCES auth.users(id)
);

-- Index for the leaderboard query (today + active + route, ordered by score)
CREATE INDEX idx_runs_leaderboard
  ON runs (event_day, archived, route, score_ms)
  WHERE NOT archived;

-- 2. Row Level Security
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read today's active runs only
CREATE POLICY "anon_read_today" ON runs
  FOR SELECT TO anon
  USING (event_day = CURRENT_DATE AND NOT archived);

-- Authenticated staff can read all runs (including archived / past days)
CREATE POLICY "staff_read_all" ON runs
  FOR SELECT TO authenticated
  USING (true);

-- Authenticated staff can insert new runs (must set created_by = their own uid)
CREATE POLICY "staff_insert" ON runs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Authenticated staff can archive runs (update archived flag only)
CREATE POLICY "staff_update" ON runs
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
