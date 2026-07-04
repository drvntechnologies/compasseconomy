/*
# Add hourly gate billing support

1. Modified Tables
  - `gates`
    - `last_billed_at` (timestamptz, nullable) - tracks when the gate was last billed for per-hour occupancy
      When null and gate is occupied, billing starts from `occupied_since`.
      After each billing cycle, this is updated to the billing cutoff time.

2. Notes
  - Used by both the departure billing (in Dispatch) and the daily scheduled billing edge function.
  - Billing is calculated in 10-minute increments (no grace period).
  - Whichever runs first (departure or daily cron) bills the accumulated time and resets `last_billed_at`.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gates' AND column_name = 'last_billed_at'
  ) THEN
    ALTER TABLE gates ADD COLUMN last_billed_at timestamptz;
  END IF;
END $$;
