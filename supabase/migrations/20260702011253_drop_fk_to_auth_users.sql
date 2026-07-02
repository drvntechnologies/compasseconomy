/*
# Remove FK constraints from public tables to auth.users

## Changes
- Drops FK constraints on `profiles.id` and `flight_logs.user_id` that reference auth.users
- These FK constraints create internal constraint triggers on auth.users that fire 
  during gotrue operations (sign-in, token refresh) and cause "Database error querying schema"
  because gotrue's internal role can't properly check referential integrity against 
  RLS-protected public tables
- The profiles table still uses the same uuid from auth.users.id, just without the FK enforcement

## Important Notes
- Application-level integrity is maintained via the trigger and auth.uid() in policies
- This is a known issue pattern with Supabase when public tables FK to auth.users
*/

-- Drop the FK constraint on profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Drop the FK constraint on flight_logs  
ALTER TABLE flight_logs DROP CONSTRAINT IF EXISTS flight_logs_user_id_fkey;
