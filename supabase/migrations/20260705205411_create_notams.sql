/*
# Create NOTAMs (Notices to Air Missions) table

1. New Tables
   - `notams`
     - `id` (uuid, primary key)
     - `title` (text, not null) - short headline
     - `body` (text, not null) - full message content
     - `priority` (text, default 'info') - info, warning, urgent
     - `created_by` (uuid, not null, defaults to auth.uid()) - admin who posted
     - `expires_at` (timestamptz, nullable) - optional expiry
     - `is_active` (boolean, default true) - soft delete / deactivate
     - `created_at` (timestamptz, default now())

2. Security
   - RLS enabled.
   - All authenticated users can read active NOTAMs.
   - Only admins (via profiles.role = 'admin') can insert, update, delete.
*/

CREATE TABLE IF NOT EXISTS notams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'urgent')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_notams" ON notams;
CREATE POLICY "authenticated_select_notams" ON notams FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_notams" ON notams;
CREATE POLICY "admin_insert_notams" ON notams FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_notams" ON notams;
CREATE POLICY "admin_update_notams" ON notams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_notams" ON notams;
CREATE POLICY "admin_delete_notams" ON notams FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_notams_active_created ON notams (is_active, created_at DESC);
