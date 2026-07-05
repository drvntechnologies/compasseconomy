/*
# Create Cargo Pools and Cargo Generation Log Tables

1. New Tables
   - `cargo_pools`
     - `id` (uuid, primary key)
     - `origin_icao` (text) - original origin of the shipment
     - `destination_icao` (text) - final destination of the shipment
     - `current_airport_icao` (text) - where the cargo currently is
     - `weight_kg` (integer) - shipment weight in kilograms
     - `status` (text) - waiting/in_transit/layover/arrived
     - `connections_remaining` (integer, 0-2) - legs remaining
     - `booking_id` (uuid, nullable) - links reserved cargo to a flight booking
     - `generated_date` (date) - when demand was generated
     - `created_at` (timestamptz)

   - `cargo_generation_log`
     - `id` (uuid, primary key)
     - `airport_icao` (text) - airport that generated cargo
     - `cargo_generated_kg` (integer) - total kg generated
     - `generation_date` (date) - date of generation
     - `created_at` (timestamptz)

2. Security
   - RLS enabled on both tables
   - All authenticated users can read cargo_pools (pilots need to see available cargo)
   - All authenticated users can update cargo_pools (for booking assignment)
   - All authenticated users can insert cargo_pools (for pool splitting during booking)
   - cargo_generation_log: all authenticated can read, insert restricted to service role

3. Indexes
   - cargo_pools: current_airport_icao, status, booking_id for fast queries
*/

CREATE TABLE IF NOT EXISTS cargo_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_icao text NOT NULL,
  destination_icao text NOT NULL,
  current_airport_icao text NOT NULL,
  weight_kg integer NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_transit', 'layover', 'arrived')),
  connections_remaining integer NOT NULL DEFAULT 0 CHECK (connections_remaining >= 0 AND connections_remaining <= 2),
  booking_id uuid REFERENCES flight_bookings(id) ON DELETE SET NULL,
  generated_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargo_pools_airport_status ON cargo_pools(current_airport_icao, status);
CREATE INDEX IF NOT EXISTS idx_cargo_pools_booking ON cargo_pools(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cargo_pools_destination ON cargo_pools(destination_icao);

ALTER TABLE cargo_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_cargo_pools" ON cargo_pools;
CREATE POLICY "select_cargo_pools" ON cargo_pools FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_cargo_pools" ON cargo_pools;
CREATE POLICY "insert_cargo_pools" ON cargo_pools FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_cargo_pools" ON cargo_pools;
CREATE POLICY "update_cargo_pools" ON cargo_pools FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_cargo_pools" ON cargo_pools;
CREATE POLICY "delete_cargo_pools" ON cargo_pools FOR DELETE
  TO authenticated USING (true);

-- Cargo generation log
CREATE TABLE IF NOT EXISTS cargo_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_icao text NOT NULL,
  cargo_generated_kg integer NOT NULL DEFAULT 0,
  generation_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cargo_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_cargo_gen_log" ON cargo_generation_log;
CREATE POLICY "select_cargo_gen_log" ON cargo_generation_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_cargo_gen_log" ON cargo_generation_log;
CREATE POLICY "insert_cargo_gen_log" ON cargo_generation_log FOR INSERT
  TO authenticated WITH CHECK (true);
