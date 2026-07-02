/*
# Allow supabase_auth_admin to bypass RLS on tables with FK to auth.users

## Changes
- Adds RLS policies for `supabase_auth_admin` on `profiles` and `flight_logs`
- The supabase_auth_admin role does NOT bypass RLS, so FK constraint checks
  fail during auth operations (sign-in updates last_sign_in_at on auth.users,
  triggering constraint triggers that check referencing tables)

## Important Notes
- This is the root cause of "Database error querying schema" on sign-in
- The FK constraint triggers need to verify referential integrity against 
  profiles and flight_logs, but RLS blocks the check
*/

-- Allow supabase_auth_admin full access to profiles (needed for FK checks + trigger)
CREATE POLICY "auth_admin_all_profiles" ON profiles FOR ALL
  TO supabase_auth_admin USING (true) WITH CHECK (true);

-- Allow supabase_auth_admin to read flight_logs (needed for FK checks)
CREATE POLICY "auth_admin_all_flight_logs" ON flight_logs FOR ALL
  TO supabase_auth_admin USING (true) WITH CHECK (true);
