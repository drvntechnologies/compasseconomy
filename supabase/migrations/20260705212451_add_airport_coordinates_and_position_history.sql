/*
# Add Airport Coordinates and ACARS Position History

1. Modified Tables
  - `airports`
    - `latitude` (numeric, nullable) - airport latitude in decimal degrees
    - `longitude` (numeric, nullable) - airport longitude in decimal degrees

2. New Tables
  - `acars_position_history`
    - `id` (uuid, primary key) - unique position report ID
    - `acars_flight_id` (uuid, FK to acars_flights) - the flight this report belongs to
    - `latitude` (numeric, not null) - aircraft latitude at time of report
    - `longitude` (numeric, not null) - aircraft longitude at time of report
    - `altitude_ft` (integer) - altitude in feet MSL
    - `ground_speed_kts` (integer) - ground speed in knots
    - `heading_deg` (integer) - magnetic heading 0-359
    - `vs_fpm` (integer) - vertical speed feet per minute
    - `phase` (text) - flight phase at time of report
    - `recorded_at` (timestamptz) - when this position was recorded

3. Security
  - Enable RLS on `acars_position_history`
  - All authenticated users can SELECT (shared airline operations view)
  - Pilots can INSERT position reports for their own flights
  - No UPDATE/DELETE needed (append-only log)

4. Important Notes
  - Position history is an append-only breadcrumb trail for route replay
  - At 1 report per 120 seconds, a 3-hour flight produces ~90 rows
  - Index on (acars_flight_id, recorded_at) for efficient path queries
  - Airport coordinates are populated for all 47 network airports
*/

-- Add coordinate columns to airports
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'airports' AND column_name = 'latitude') THEN
    ALTER TABLE airports ADD COLUMN latitude numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'airports' AND column_name = 'longitude') THEN
    ALTER TABLE airports ADD COLUMN longitude numeric;
  END IF;
END $$;

-- Populate airport coordinates for the network
UPDATE airports SET latitude = 40.6413, longitude = -73.7781 WHERE icao_code = 'KJFK';
UPDATE airports SET latitude = 40.6925, longitude = -74.1687 WHERE icao_code = 'KEWR';
UPDATE airports SET latitude = 40.7769, longitude = -73.8740 WHERE icao_code = 'KLGA';
UPDATE airports SET latitude = 42.3656, longitude = -71.0096 WHERE icao_code = 'KBOS';
UPDATE airports SET latitude = 38.9531, longitude = -77.4565 WHERE icao_code = 'KIAD';
UPDATE airports SET latitude = 38.8512, longitude = -77.0402 WHERE icao_code = 'KDCA';
UPDATE airports SET latitude = 39.1754, longitude = -76.6684 WHERE icao_code = 'KBWI';
UPDATE airports SET latitude = 39.8721, longitude = -75.2411 WHERE icao_code = 'KPHL';
UPDATE airports SET latitude = 33.6407, longitude = -84.4277 WHERE icao_code = 'KATL';
UPDATE airports SET latitude = 35.2140, longitude = -80.9431 WHERE icao_code = 'KCLT';
UPDATE airports SET latitude = 25.7959, longitude = -80.2870 WHERE icao_code = 'KMIA';
UPDATE airports SET latitude = 26.0726, longitude = -80.1527 WHERE icao_code = 'KFLL';
UPDATE airports SET latitude = 28.4312, longitude = -81.3081 WHERE icao_code = 'KMCO';
UPDATE airports SET latitude = 27.9755, longitude = -82.5332 WHERE icao_code = 'KTPA';
UPDATE airports SET latitude = 41.9742, longitude = -87.9073 WHERE icao_code = 'KORD';
UPDATE airports SET latitude = 41.7868, longitude = -87.7522 WHERE icao_code = 'KMDW';
UPDATE airports SET latitude = 42.2124, longitude = -83.3534 WHERE icao_code = 'KDTW';
UPDATE airports SET latitude = 41.4117, longitude = -81.8498 WHERE icao_code = 'KCLE';
UPDATE airports SET latitude = 39.0489, longitude = -84.6678 WHERE icao_code = 'KCVG';
UPDATE airports SET latitude = 44.8848, longitude = -93.2223 WHERE icao_code = 'KMSP';
UPDATE airports SET latitude = 32.8998, longitude = -97.0403 WHERE icao_code = 'KDFW';
UPDATE airports SET latitude = 29.9844, longitude = -95.3414 WHERE icao_code = 'KIAH';
UPDATE airports SET latitude = 29.6454, longitude = -95.2789 WHERE icao_code = 'KHOU';
UPDATE airports SET latitude = 29.9934, longitude = -90.2580 WHERE icao_code = 'KMSY';
UPDATE airports SET latitude = 33.4373, longitude = -112.0078 WHERE icao_code = 'KPHX';
UPDATE airports SET latitude = 39.8561, longitude = -104.6737 WHERE icao_code = 'KDEN';
UPDATE airports SET latitude = 36.0840, longitude = -115.1537 WHERE icao_code = 'KLAS';
UPDATE airports SET latitude = 40.7884, longitude = -111.9778 WHERE icao_code = 'KSLC';
UPDATE airports SET latitude = 33.9425, longitude = -118.4081 WHERE icao_code = 'KLAX';
UPDATE airports SET latitude = 37.6213, longitude = -122.3790 WHERE icao_code = 'KSFO';
UPDATE airports SET latitude = 47.4502, longitude = -122.3088 WHERE icao_code = 'KSEA';
UPDATE airports SET latitude = 45.5887, longitude = -122.5975 WHERE icao_code = 'KPDX';
UPDATE airports SET latitude = 32.7336, longitude = -117.1897 WHERE icao_code = 'KSAN';
UPDATE airports SET latitude = 21.3187, longitude = -157.9225 WHERE icao_code = 'PHNL';
UPDATE airports SET latitude = 18.4373, longitude = -66.0041 WHERE icao_code = 'TJSJ';
UPDATE airports SET latitude = 43.6772, longitude = -79.6306 WHERE icao_code = 'CYYZ';
UPDATE airports SET latitude = 45.4706, longitude = -73.7408 WHERE icao_code = 'CYUL';
UPDATE airports SET latitude = 49.1947, longitude = -123.1792 WHERE icao_code = 'CYVR';
UPDATE airports SET latitude = 51.4775, longitude = -0.4614 WHERE icao_code = 'EGLL';
UPDATE airports SET latitude = 48.3538, longitude = 11.7861 WHERE icao_code = 'EDDM';
UPDATE airports SET latitude = 50.0379, longitude = 8.5622 WHERE icao_code = 'EDDF';
UPDATE airports SET latitude = 52.3105, longitude = 4.7683 WHERE icao_code = 'EHAM';
UPDATE airports SET latitude = 49.0097, longitude = 2.5479 WHERE icao_code = 'LFPG';
UPDATE airports SET latitude = 41.2971, longitude = 2.0785 WHERE icao_code = 'LEBL';
UPDATE airports SET latitude = 25.2528, longitude = 55.3644 WHERE icao_code = 'OMDB';
UPDATE airports SET latitude = 35.7647, longitude = 140.3864 WHERE icao_code = 'RJTT';
UPDATE airports SET latitude = 1.3644, longitude = 103.9915 WHERE icao_code = 'WSSS';

-- Create position history table
CREATE TABLE IF NOT EXISTS acars_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acars_flight_id uuid NOT NULL REFERENCES acars_flights(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  altitude_ft integer,
  ground_speed_kts integer,
  heading_deg integer CHECK (heading_deg >= 0 AND heading_deg < 360),
  vs_fpm integer,
  phase text CHECK (phase IN (
    'preflight', 'taxi_out', 'takeoff', 'climb', 'cruise',
    'descent', 'approach', 'landed', 'taxi_in', 'parked'
  )),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_position_history_flight_time
  ON acars_position_history(acars_flight_id, recorded_at);

ALTER TABLE acars_position_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view position history (shared airline ops)
DROP POLICY IF EXISTS "select_position_history" ON acars_position_history;
CREATE POLICY "select_position_history" ON acars_position_history FOR SELECT
  TO authenticated USING (true);

-- Pilots can insert position reports for their own flights
DROP POLICY IF EXISTS "insert_own_position_history" ON acars_position_history;
CREATE POLICY "insert_own_position_history" ON acars_position_history FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM acars_flights
      WHERE acars_flights.id = acars_position_history.acars_flight_id
      AND acars_flights.user_id = auth.uid()
    )
  );
