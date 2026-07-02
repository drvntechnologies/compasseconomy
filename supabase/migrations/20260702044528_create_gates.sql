/*
# Create gates table for airport gate management

1. New Tables
  - `gates`
    - `id` (uuid, primary key)
    - `airport_icao` (text) - which airport this gate belongs to
    - `gate_number` (text) - e.g. "A1", "B12", "R3"
    - `gate_type` (text) - "heavy", "medium", "small", "ramp"
    - `lease_type` (text) - "full_time", "part_time", "per_hour"
    - `monthly_price` (numeric, nullable) - for full_time/part_time leases
    - `hourly_price` (numeric, nullable) - for per_hour leases
    - `status` (text) - "open" or "occupied"
    - `assigned_aircraft_id` (uuid, nullable) - FK to aircraft table
    - `assigned_booking_id` (uuid, nullable) - FK to flight_bookings table
    - `occupied_since` (timestamptz, nullable) - when the gate was occupied (for per-hour billing)
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on `gates`
  - All authenticated users can view all gates
  - Only admins can insert/delete gates
  - Authenticated users can update gate status (for assignment on landing)

3. Notes
  - Unique constraint on (airport_icao, gate_number) prevents duplicate gates at same airport
  - Gate types have a hierarchy: heavy > medium > small > ramp
  - Pilots request gate assignment on landing; best-fit algorithm assigns appropriate gate
  - Gates stay occupied until the aircraft departs from that airport
*/

CREATE TABLE IF NOT EXISTS gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_icao text NOT NULL,
  gate_number text NOT NULL,
  gate_type text NOT NULL CHECK (gate_type IN ('heavy', 'medium', 'small', 'ramp')),
  lease_type text NOT NULL CHECK (lease_type IN ('full_time', 'part_time', 'per_hour')),
  monthly_price numeric,
  hourly_price numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'occupied')),
  assigned_aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL,
  assigned_booking_id uuid REFERENCES flight_bookings(id) ON DELETE SET NULL,
  occupied_since timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(airport_icao, gate_number)
);

ALTER TABLE gates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all gates
DROP POLICY IF EXISTS "select_all_gates" ON gates;
CREATE POLICY "select_all_gates" ON gates FOR SELECT
  TO authenticated USING (true);

-- Only admins can insert gates
DROP POLICY IF EXISTS "admin_insert_gates" ON gates;
CREATE POLICY "admin_insert_gates" ON gates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Authenticated users can update gates (for assignment on landing)
DROP POLICY IF EXISTS "authenticated_update_gates" ON gates;
CREATE POLICY "authenticated_update_gates" ON gates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Only admins can delete gates
DROP POLICY IF EXISTS "admin_delete_gates" ON gates;
CREATE POLICY "admin_delete_gates" ON gates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_gates_airport ON gates(airport_icao);
CREATE INDEX IF NOT EXISTS idx_gates_status ON gates(status);
CREATE INDEX IF NOT EXISTS idx_gates_aircraft ON gates(assigned_aircraft_id);
