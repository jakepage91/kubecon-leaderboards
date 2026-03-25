-- Remove strokes column and update score_ms to be time-only

-- 1. Drop the generated column first (depends on strokes)
ALTER TABLE runs DROP COLUMN score_ms;

-- 2. Drop strokes column
ALTER TABLE runs DROP COLUMN strokes;

-- 3. Re-create score_ms as elapsed_ms + deterministic tiebreaker
ALTER TABLE runs ADD COLUMN score_ms bigint GENERATED ALWAYS AS (
  elapsed_ms::bigint + (abs(hashtext(id::text)) % 1000)
) STORED;
