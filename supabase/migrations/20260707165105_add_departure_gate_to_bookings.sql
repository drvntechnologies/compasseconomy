/*
# Add departure_gate column to flight_bookings

1. Modified Tables
  - `flight_bookings`
    - `departure_gate` (text, nullable) - stores the gate number the aircraft departed from,
      captured at booking time before the gate is released. Persists even after the gate is freed.

2. Important Notes
  - This column is informational only, used to display the departure gate in Dispatch and ACARS views
  - No RLS changes needed since the existing policies on flight_bookings already cover this column
  - The value is set during the booking flow by reading the aircraft's current gate before releasing it
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_bookings' AND column_name = 'departure_gate'
  ) THEN
    ALTER TABLE flight_bookings ADD COLUMN departure_gate text;
  END IF;
END $$;
