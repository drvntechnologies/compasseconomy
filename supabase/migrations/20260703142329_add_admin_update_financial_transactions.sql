/*
# Allow admins to update financial transactions

1. Security Changes
  - Add UPDATE policy on `financial_transactions` for admin users only
  - Admins can edit transaction amount and description to correct data entry errors

2. Notes
  - This breaks the strict append-only model but is necessary for admin corrections
  - Only users with role='admin' in profiles can update
*/

DROP POLICY IF EXISTS "admin_update_transactions" ON financial_transactions;
CREATE POLICY "admin_update_transactions" ON financial_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
