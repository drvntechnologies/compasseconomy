/*
# Add admin update policies for flight_bookings and acars_flights

1. Security Changes
   - Add UPDATE policy on `flight_bookings` allowing admins to update any booking
     (e.g. cancel another user's flight from Dispatch).
   - Add UPDATE policy on `acars_flights` allowing admins to update any ACARS record
     (e.g. terminate an orphaned ACARS record when cancelling another user's booking).

2. Why
   - Without these policies, an admin's attempt to cancel or complete another user's
     booking silently fails because the existing `update_own_bookings` and
     `update_own_acars` policies restrict updates to `auth.uid() = user_id`.
*/

-- Admin can update any flight booking (cancel, complete, etc.)
DROP POLICY IF EXISTS "admin_update_any_booking" ON flight_bookings;
CREATE POLICY "admin_update_any_booking" ON flight_bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Admin can update any ACARS flight record
DROP POLICY IF EXISTS "admin_update_any_acars" ON acars_flights;
CREATE POLICY "admin_update_any_acars" ON acars_flights
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
