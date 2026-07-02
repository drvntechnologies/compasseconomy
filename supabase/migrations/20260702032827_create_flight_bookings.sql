/*
# Create flight_bookings table

1. New Tables
  - `flight_bookings`
    - `id` (uuid, primary key)
    - `user_id` (uuid, the pilot who booked, defaults to auth.uid())
    - `flight_number` (text, the route flight number)
    - `departure_icao` (text, departure airport)
    - `arrival_icao` (text, arrival airport)
    - `departure_time_utc` (timestamptz, scheduled departure in Zulu)
    - `pax_count` (integer, actual passengers booked)
    - `status` (text, one of: booked, completed, cancelled)
    - `created_at` (timestamptz)

2. Modified Tables
  - `pax_pools` - add `booking_id` column (uuid, nullable) to link reserved pax to a booking

3. Security
  - Enable RLS on `flight_bookings`
  - Authenticated users can CRUD their own bookings
  - All authenticated users can view all bookings (for visibility into in-transit pax)

4. Notes
  - When a pilot books a flight, eligible pax_pools get status='in_transit' and booking_id set
  - When flight is completed, pax move to arrived/layover and booking status='completed'
  - The booking_id on pax_pools prevents double-booking
*/

CREATE TABLE IF NOT EXISTS flight_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  flight_number text NOT NULL,
  departure_icao text NOT NULL,
  arrival_icao text NOT NULL,
  departure_time_utc timestamptz NOT NULL,
  pax_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flight_bookings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see all bookings (needed for dispatch visibility)
DROP POLICY IF EXISTS "select_all_bookings" ON flight_bookings;
CREATE POLICY "select_all_bookings" ON flight_bookings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_bookings" ON flight_bookings;
CREATE POLICY "insert_own_bookings" ON flight_bookings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookings" ON flight_bookings;
CREATE POLICY "update_own_bookings" ON flight_bookings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookings" ON flight_bookings;
CREATE POLICY "delete_own_bookings" ON flight_bookings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add booking_id to pax_pools to track which passengers are reserved
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pax_pools' AND column_name = 'booking_id'
  ) THEN
    ALTER TABLE pax_pools ADD COLUMN booking_id uuid REFERENCES flight_bookings(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_flight_bookings_status ON flight_bookings(status);
CREATE INDEX IF NOT EXISTS idx_flight_bookings_user ON flight_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_pax_pools_booking_id ON pax_pools(booking_id);
