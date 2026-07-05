/*
# Add Aircraft Weight and Cargo Capacity Fields

1. Modified Tables
   - `aircraft`
     - `is_freighter` (boolean, default false) - flags pure cargo planes (MD-11F, future 772F)
     - `max_cargo_kg` (integer, default 0) - maximum cargo payload capacity in kg
     - `oew_kg` (integer, nullable) - operating empty weight in kg
     - `mtow_kg` (integer, nullable) - maximum takeoff weight in kg
     - `mlw_kg` (integer, nullable) - maximum landing weight in kg

2. Data Updates
   - Sets realistic weight data for all existing aircraft types
   - Marks MD-11F as freighter with appropriate cargo capacity

3. Notes
   - These fields enable MTOW-safe cargo loading calculations
   - SimBrief integration uses oew_kg, mtow_kg, mlw_kg for weight validation
   - Belly cargo for pax planes calculated from remaining payload after passengers
*/

-- Add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aircraft' AND column_name = 'is_freighter') THEN
    ALTER TABLE aircraft ADD COLUMN is_freighter boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aircraft' AND column_name = 'max_cargo_kg') THEN
    ALTER TABLE aircraft ADD COLUMN max_cargo_kg integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aircraft' AND column_name = 'oew_kg') THEN
    ALTER TABLE aircraft ADD COLUMN oew_kg integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aircraft' AND column_name = 'mtow_kg') THEN
    ALTER TABLE aircraft ADD COLUMN mtow_kg integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aircraft' AND column_name = 'mlw_kg') THEN
    ALTER TABLE aircraft ADD COLUMN mlw_kg integer;
  END IF;
END $$;

-- Populate realistic weight data per aircraft type
UPDATE aircraft SET is_freighter = true, max_cargo_kg = 86000, oew_kg = 112750, mtow_kg = 286000, mlw_kg = 213000 WHERE aircraft_type = 'MD11F';
UPDATE aircraft SET max_cargo_kg = 20000, oew_kg = 40800, mtow_kg = 68000, mlw_kg = 61000 WHERE aircraft_type = 'A319';
UPDATE aircraft SET max_cargo_kg = 20000, oew_kg = 42600, mtow_kg = 73500, mlw_kg = 64500 WHERE aircraft_type = 'A320';
UPDATE aircraft SET max_cargo_kg = 22000, oew_kg = 48500, mtow_kg = 89000, mlw_kg = 77800 WHERE aircraft_type = 'A321';
UPDATE aircraft SET max_cargo_kg = 20000, oew_kg = 41400, mtow_kg = 70500, mlw_kg = 63300 WHERE aircraft_type = 'B38M';
UPDATE aircraft SET max_cargo_kg = 20000, oew_kg = 42500, mtow_kg = 74300, mlw_kg = 66360 WHERE aircraft_type = 'B739';
UPDATE aircraft SET max_cargo_kg = 44000, oew_kg = 135600, mtow_kg = 247200, mlw_kg = 201840 WHERE aircraft_type = 'B772';
UPDATE aircraft SET max_cargo_kg = 15000, oew_kg = 57600, mtow_kg = 113400, mlw_kg = 89400 WHERE aircraft_type = 'N752';
UPDATE aircraft SET max_cargo_kg = 53000, oew_kg = 160500, mtow_kg = 351500, mlw_kg = 251300 WHERE aircraft_type = 'N77W';
