/*
# Allow admins to update any profile

## Problem
The existing `update_own_profile` policy only allows users to update their own profile
(auth.uid() = id). When an admin promotes/demotes another user, the UPDATE is silently
blocked by RLS, so the role change never persists.

## Changes
- Add a new UPDATE policy that allows users with role='admin' in their own profile
  to update ANY profile row.

## Security
- Uses a subquery to check the caller's role from the profiles table.
- Only grants UPDATE, not DELETE or INSERT on other rows.
*/

DROP POLICY IF EXISTS "admins_update_any_profile" ON profiles;
CREATE POLICY "admins_update_any_profile"
ON profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);