/*
# Fix handle_new_user trigger function search_path

## Changes
- Adds `SET search_path = public` to the `handle_new_user` function
- This is required for SECURITY DEFINER functions to work properly with Supabase Auth (gotrue)
- Without it, gotrue cannot resolve the public schema during auth token operations

## Important Notes
- The missing search_path caused "Database error querying schema" on sign-in
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
