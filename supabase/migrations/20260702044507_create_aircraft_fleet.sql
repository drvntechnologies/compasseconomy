/*
# Create aircraft fleet table

1. New Tables
  - `aircraft`
    - `id` (uuid, primary key)
    - `tail_number` (text, unique) - e.g. "N737CA"
    - `aircraft_type` (text) - e.g. "737-800", "A321", "757-200"
    - `size_category` (text) - "heavy", "medium", "small", "ramp" for gate matching
    - `max_pax` (integer) - maximum passenger capacity
    - `current_airport_icao` (text) - where the plane is currently located
    - `status` (text) - "available", "reserved", "in_flight", "maintenance"
    - `reserved_by_booking_id` (uuid, nullable) - links to flight_bookings when reserved
    - `created_at` (timestamptz)

2. Modified Tables
  - `flight_bookings` - add `aircraft_id` column (uuid, nullable) to link bookings to aircraft

3. Security
  - Enable RLS on `aircraft`
  - All authenticated users can view all aircraft
  - Only admins can insert/update/delete aircraft (via profile role check)
  - Authenticated users can update aircraft status (for reservation/completion flows)

4. Notes
  - Aircraft move between airports when flights are completed
  - Aircraft are reserved (locked) when a pilot books a flight
  - Size category determines gate compatibility
*/

CREATE TABLE IF NOT EXISTS aircraft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tail_number text UNIQUE NOT NULL,
  aircraft_type text NOT NULL,
  size_category text NOT NULL CHECK (size_category IN ('heavy', 'medium', 'small', 'ramp')),
  max_pax integer NOT NULL DEFAULT 0,
  current_airport_icao text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'in_flight', 'maintenance')),
  reserved_by_booking_id uuid REFERENCES flight_bookings(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE aircraft ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all aircraft
DROP POLICY IF EXISTS "select_all_aircraft" ON aircraft;
CREATE POLICY "select_all_aircraft" ON aircraft FOR SELECT
  TO authenticated USING (true);

-- Only admins can insert aircraft
DROP POLICY IF EXISTS "admin_insert_aircraft" ON aircraft;
CREATE POLICY "admin_insert_aircraft" ON aircraft FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Authenticated users can update aircraft (for status changes during booking/completion)
DROP POLICY IF EXISTS "authenticated_update_aircraft" ON aircraft;
CREATE POLICY "authenticated_update_aircraft" ON aircraft FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Only admins can delete aircraft
DROP POLICY IF EXISTS "admin_delete_aircraft" ON aircraft;
CREATE POLICY "admin_delete_aircraft" ON aircraft FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Add aircraft_id to flight_bookings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_bookings' AND column_name = 'aircraft_id'
  ) THEN
    ALTER TABLE flight_bookings ADD COLUMN aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aircraft_status ON aircraft(status);
CREATE INDEX IF NOT EXISTS idx_aircraft_airport ON aircraft(current_airport_icao);
CREATE INDEX IF NOT EXISTS idx_aircraft_tail ON aircraft(tail_number);
CREATE INDEX IF NOT EXISTS idx_flight_bookings_aircraft ON flight_bookings(aircraft_id);
