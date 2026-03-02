-- Add modification tracking columns
ALTER TABLE runs
  ADD COLUMN modified_by uuid REFERENCES auth.users(id),
  ADD COLUMN modified_at timestamptz;
