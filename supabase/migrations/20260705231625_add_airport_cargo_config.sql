/*
# Add Airport Cargo Generation Config

1. Modified Tables
   - `airports`
     - `min_daily_cargo_kg` (integer, default 0) - minimum daily cargo generated at this airport
     - `max_daily_cargo_kg` (integer, default 0) - maximum daily cargo generated at this airport

2. Data Updates
   - Sets initial cargo generation values for hub airports (higher volume)
   - Sets moderate values for non-hub airports

3. Notes
   - Admin-adjustable per airport via the admin panel
   - Mirrors the existing min_daily_pax / max_daily_pax pattern
   - Airports with max_daily_cargo_kg = 0 will not generate cargo
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'airports' AND column_name = 'min_daily_cargo_kg') THEN
    ALTER TABLE airports ADD COLUMN min_daily_cargo_kg integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'airports' AND column_name = 'max_daily_cargo_kg') THEN
    ALTER TABLE airports ADD COLUMN max_daily_cargo_kg integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Set reasonable defaults: hubs get more cargo, non-hubs less
UPDATE airports SET min_daily_cargo_kg = 40000, max_daily_cargo_kg = 120000 WHERE is_hub = true;
UPDATE airports SET min_daily_cargo_kg = 8000, max_daily_cargo_kg = 35000 WHERE is_hub = false AND min_daily_cargo_kg = 0;
