/*
# Create Passenger Demand System Tables

## Overview
Creates the core tables for a virtual airline passenger demand system including
airports, routes, passenger pools, flight logs, and layover tracking.

## New Tables

### profiles
- `id` (uuid, PK, references auth.users)
- `email` (text)
- `display_name` (text)
- `role` (text: 'admin' or 'user', default 'user')
- `created_at` (timestamptz)

### airports
- `id` (uuid, PK)
- `icao_code` (text, unique, not null) - ICAO airport identifier
- `is_hub` (boolean, default false) - hub vs spoke designation
- `min_daily_pax` (integer) - minimum daily pax generation
- `max_daily_pax` (integer) - maximum daily pax generation
- `created_at` (timestamptz)

### routes
- `id` (uuid, PK)
- `flight_number` (text) - airline flight number
- `departure_icao` (text, FK airports) - departure airport
- `arrival_icao` (text, FK airports) - arrival airport
- `flight_type` (text) - pax type
- `duration_minutes` (integer) - block time
- `days_of_week` (jsonb) - which days the route operates
- `airframes` (text) - allowed aircraft types
- `is_active` (boolean, default true)
- `created_at` (timestamptz)

### pax_pools
- `id` (uuid, PK)
- `origin_icao` (text, FK airports) - where pax originate
- `destination_icao` (text, FK airports) - final destination
- `current_airport_icao` (text, FK airports) - where pax currently are
- `pax_count` (integer) - number of passengers in this pool
- `status` (text) - 'waiting', 'in_transit', 'layover', 'arrived'
- `connections_remaining` (integer) - how many connections left (0-2)
- `generated_date` (date) - when demand was generated
- `created_at` (timestamptz)

### flight_logs
- `id` (uuid, PK)
- `user_id` (uuid, FK auth.users) - pilot who logged the flight
- `flight_number` (text)
- `departure_icao` (text)
- `arrival_icao` (text)
- `pax_count` (integer) - passengers carried
- `flight_date` (date)
- `created_at` (timestamptz)

### demand_generation_log
- `id` (uuid, PK)
- `airport_icao` (text, FK airports)
- `pax_generated` (integer)
- `generation_date` (date)
- `created_at` (timestamptz)

## Security
- RLS enabled on all tables
- Profiles: users can read all, update own
- Airports/Routes: all authenticated can read, only admins can write
- Pax pools: all authenticated can read and update (for flight logging)
- Flight logs: all authenticated can read, users can insert own
- Demand generation log: all authenticated can read
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_profiles" ON profiles;
CREATE POLICY "select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Airports table
CREATE TABLE IF NOT EXISTS airports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icao_code text UNIQUE NOT NULL,
  is_hub boolean NOT NULL DEFAULT false,
  min_daily_pax integer NOT NULL DEFAULT 300,
  max_daily_pax integer NOT NULL DEFAULT 500,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE airports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_airports" ON airports;
CREATE POLICY "select_airports" ON airports FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_airports" ON airports;
CREATE POLICY "insert_airports" ON airports FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "update_airports" ON airports;
CREATE POLICY "update_airports" ON airports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "delete_airports" ON airports;
CREATE POLICY "delete_airports" ON airports FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_number text NOT NULL,
  departure_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  arrival_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  flight_type text NOT NULL DEFAULT 'pax',
  duration_minutes integer NOT NULL,
  days_of_week jsonb NOT NULL DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":true,"sun":true}',
  airframes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_routes" ON routes;
CREATE POLICY "select_routes" ON routes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_routes" ON routes;
CREATE POLICY "insert_routes" ON routes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "update_routes" ON routes;
CREATE POLICY "update_routes" ON routes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "delete_routes" ON routes;
CREATE POLICY "delete_routes" ON routes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Pax pools table
CREATE TABLE IF NOT EXISTS pax_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  destination_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  current_airport_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  pax_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_transit', 'layover', 'arrived')),
  connections_remaining integer NOT NULL DEFAULT 0 CHECK (connections_remaining >= 0 AND connections_remaining <= 2),
  generated_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pax_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pax_pools" ON pax_pools;
CREATE POLICY "select_pax_pools" ON pax_pools FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_pax_pools" ON pax_pools;
CREATE POLICY "insert_pax_pools" ON pax_pools FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "update_pax_pools" ON pax_pools;
CREATE POLICY "update_pax_pools" ON pax_pools FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_pax_pools" ON pax_pools;
CREATE POLICY "delete_pax_pools" ON pax_pools FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Flight logs table
CREATE TABLE IF NOT EXISTS flight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  flight_number text NOT NULL,
  departure_icao text NOT NULL,
  arrival_icao text NOT NULL,
  pax_count integer NOT NULL DEFAULT 0,
  flight_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_flight_logs" ON flight_logs;
CREATE POLICY "select_flight_logs" ON flight_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_flight_logs" ON flight_logs;
CREATE POLICY "insert_own_flight_logs" ON flight_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flight_logs" ON flight_logs;
CREATE POLICY "update_own_flight_logs" ON flight_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flight_logs" ON flight_logs;
CREATE POLICY "delete_own_flight_logs" ON flight_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Demand generation log
CREATE TABLE IF NOT EXISTS demand_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_icao text NOT NULL REFERENCES airports(icao_code) ON DELETE CASCADE,
  pax_generated integer NOT NULL,
  generation_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE demand_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_demand_log" ON demand_generation_log;
CREATE POLICY "select_demand_log" ON demand_generation_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_demand_log" ON demand_generation_log;
CREATE POLICY "insert_demand_log" ON demand_generation_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "update_demand_log" ON demand_generation_log;
CREATE POLICY "update_demand_log" ON demand_generation_log FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "delete_demand_log" ON demand_generation_log;
CREATE POLICY "delete_demand_log" ON demand_generation_log FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_departure ON routes(departure_icao);
CREATE INDEX IF NOT EXISTS idx_routes_arrival ON routes(arrival_icao);
CREATE INDEX IF NOT EXISTS idx_pax_pools_current_airport ON pax_pools(current_airport_icao);
CREATE INDEX IF NOT EXISTS idx_pax_pools_status ON pax_pools(status);
CREATE INDEX IF NOT EXISTS idx_pax_pools_origin ON pax_pools(origin_icao);
CREATE INDEX IF NOT EXISTS idx_pax_pools_destination ON pax_pools(destination_icao);
CREATE INDEX IF NOT EXISTS idx_flight_logs_user ON flight_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_flight_logs_date ON flight_logs(flight_date);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
