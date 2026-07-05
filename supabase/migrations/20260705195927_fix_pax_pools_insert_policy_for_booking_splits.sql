/*
# Fix pax_pools INSERT RLS policy for booking splits

## Problem
The INSERT policy on pax_pools only allows admin users to insert rows. When a
non-admin pilot books a flight, the booking logic needs to SPLIT a pax pool
(reduce the original pool's count and INSERT a new record with the reserved pax).
The INSERT fails silently for non-admin users, causing passengers to vanish from
the system (deducted from the original pool but never created as a new in_transit record).

## Changes
- Drops the admin-only INSERT policy on pax_pools
- Creates a new INSERT policy allowing all authenticated users to insert
  (needed for the pool-split operation during booking)

## Security Notes
- All authenticated pilots need to insert during the booking split flow
- The UPDATE policy (already open) lets any authenticated user modify pax anyway,
  so restricting INSERT to admin provided no real security benefit
- The booking flow validates pax eligibility client-side before inserting
*/

DROP POLICY IF EXISTS "insert_pax_pools" ON pax_pools;

CREATE POLICY "insert_pax_pools" ON pax_pools FOR INSERT
  TO authenticated
  WITH CHECK (true);
