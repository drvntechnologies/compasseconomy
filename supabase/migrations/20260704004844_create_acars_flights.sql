/*
# Create ACARS Flight Tracking Table

1. New Tables
  - `acars_flights`
    - `id` (uuid, primary key)
    - `booking_id` (uuid, references flight_bookings) - links to the flight booking being tracked
    - `user_id` (uuid, not null, defaults to auth.uid()) - the pilot flying
    - `phase` (text) - current flight phase: preflight, taxi_out, takeoff, climb, cruise, descent, approach, landed, taxi_in, parked
    - `altitude_ft` (integer, nullable) - current altitude in feet
    - `ground_speed_kts` (integer, nullable) - ground speed in knots
    - `heading_deg` (integer, nullable) - magnetic heading in degrees
    - `latitude` (numeric, nullable) - current position lat
    - `longitude` (numeric, nullable) - current position lon
    - `fuel_lbs` (numeric, nullable) - remaining fuel in pounds
    - `vs_fpm` (integer, nullable) - vertical speed in feet per minute
    - `sim_rate` (numeric, default 1) - simulator time rate
    - `last_report_at` (timestamptz) - when the last ACARS report was received
    - `started_at` (timestamptz, nullable) - when tracking started
    - `ended_at` (timestamptz, nullable) - when tracking ended (flight complete)
    - `created_at` (timestamptz)

2. Modified Tables
  - `flight_bookings` - adds 'in_progress' to allowed status values via CHECK constraint replacement

3. Security
  - Enable RLS on `acars_flights`
  - All authenticated users can SELECT (shared airline view)
  - Pilots can INSERT and UPDATE their own ACARS records
  - Pilots can DELETE their own ACARS records

4. Important Notes
  - The `phase` column uses a CHECK constraint for valid flight phases
  - `booking_id` is unique to ensure one active ACARS record per booking
  - When a booking transitions to 'in_progress', the ACARS tracking begins
  - The existing status CHECK on flight_bookings is replaced to allow the new state
*/

-- Update flight_bookings status constraint to allow 'in_progress'
ALTER TABLE flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_status_check;
ALTER TABLE flight_bookings ADD CONSTRAINT flight_bookings_status_check
  CHECK (status IN ('booked', 'in_progress', 'completed', 'cancelled'));

-- Create ACARS flights table
CREATE TABLE IF NOT EXISTS acars_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  phase text NOT NULL DEFAULT 'preflight' CHECK (phase IN (
    'preflight', 'taxi_out', 'takeoff', 'climb', 'cruise',
    'descent', 'approach', 'landed', 'taxi_in', 'parked'
  )),
  altitude_ft integer,
  ground_speed_kts integer,
  heading_deg integer CHECK (heading_deg >= 0 AND heading_deg < 360),
  latitude numeric,
  longitude numeric,
  fuel_lbs numeric,
  vs_fpm integer,
  sim_rate numeric NOT NULL DEFAULT 1,
  last_report_at timestamptz DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_booking_acars UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_acars_flights_booking ON acars_flights(booking_id);
CREATE INDEX IF NOT EXISTS idx_acars_flights_user ON acars_flights(user_id);
CREATE INDEX IF NOT EXISTS idx_acars_flights_phase ON acars_flights(phase);

ALTER TABLE acars_flights ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view ACARS data (shared airline operations)
DROP POLICY IF EXISTS "select_acars_flights" ON acars_flights;
CREATE POLICY "select_acars_flights" ON acars_flights FOR SELECT
  TO authenticated USING (true);

-- Pilots can insert their own ACARS records
DROP POLICY IF EXISTS "insert_own_acars" ON acars_flights;
CREATE POLICY "insert_own_acars" ON acars_flights FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Pilots can update their own ACARS records
DROP POLICY IF EXISTS "update_own_acars" ON acars_flights;
CREATE POLICY "update_own_acars" ON acars_flights FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pilots can delete their own ACARS records
DROP POLICY IF EXISTS "delete_own_acars" ON acars_flights;
CREATE POLICY "delete_own_acars" ON acars_flights FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
