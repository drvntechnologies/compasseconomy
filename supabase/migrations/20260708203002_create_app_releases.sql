/*
# Create app_releases table for auto-updater

Stores desktop app release metadata used by the Tauri updater plugin.
The check-update edge function reads from this table to serve update manifests.

1. New Tables
   - `app_releases`
     - `id` (uuid, primary key)
     - `version` (text, semver string e.g. "0.2.0")
     - `notes` (text, release notes)
     - `pub_date` (timestamptz, when published)
     - `platform` (text, e.g. "windows-x86_64")
     - `download_url` (text, URL to the installer binary)
     - `signature` (text, contents of the .sig file for Tauri verification)
     - `active` (boolean, whether this release is live)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled.
   - Only admins (via profiles.role = 'admin') can insert/update/delete.
   - Public SELECT allowed so edge function can read without service role.

3. Notes
   - One row per platform per version.
   - The check-update edge function queries for the latest active release per platform.
*/

CREATE TABLE IF NOT EXISTS app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  notes text,
  pub_date timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL DEFAULT 'windows-x86_64',
  download_url text NOT NULL,
  signature text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(version, platform)
);

ALTER TABLE app_releases ENABLE ROW LEVEL SECURITY;

-- Public read so the edge function (and anyone) can check for updates
DROP POLICY IF EXISTS "public_select_releases" ON app_releases;
CREATE POLICY "public_select_releases" ON app_releases FOR SELECT
  TO anon, authenticated USING (true);

-- Only admins can insert
DROP POLICY IF EXISTS "admin_insert_releases" ON app_releases;
CREATE POLICY "admin_insert_releases" ON app_releases FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can update
DROP POLICY IF EXISTS "admin_update_releases" ON app_releases;
CREATE POLICY "admin_update_releases" ON app_releases FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Only admins can delete
DROP POLICY IF EXISTS "admin_delete_releases" ON app_releases;
CREATE POLICY "admin_delete_releases" ON app_releases FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
