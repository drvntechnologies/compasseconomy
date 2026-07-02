/*
# Grant supabase_auth_admin access to public tables with FK to auth.users

## Changes
- Grants SELECT and INSERT on `profiles` to `supabase_auth_admin`
- Grants SELECT on `flight_logs` to `supabase_auth_admin`
- These grants are needed because the FK constraint triggers from auth.users
  to these public tables fire during auth operations (sign-in updates last_sign_in_at),
  and the constraint checker needs to verify referential integrity.

## Important Notes
- Without these grants, gotrue returns "Database error querying schema" on sign-in
- The trigger function also needs INSERT for profile creation on sign-up
*/

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT, INSERT ON public.profiles TO supabase_auth_admin;
GRANT SELECT ON public.flight_logs TO supabase_auth_admin;
