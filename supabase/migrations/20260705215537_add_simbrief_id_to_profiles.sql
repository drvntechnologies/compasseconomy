/*
# Add SimBrief Pilot ID to Profiles

1. Modified Tables
  - `profiles`
    - `simbrief_id` (text, nullable) - the user's SimBrief Pilot ID used to fetch OFPs via the SimBrief API

2. Important Notes
  - SimBrief Pilot ID is a numeric string found in the user's SimBrief account settings
  - Used to call: https://www.simbrief.com/api/xml.fetcher.php?userid=ID&json=1
  - Each pilot sets their own; it's not sensitive (public API, read-only)
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'simbrief_id') THEN
    ALTER TABLE profiles ADD COLUMN simbrief_id text;
  END IF;
END $$;
