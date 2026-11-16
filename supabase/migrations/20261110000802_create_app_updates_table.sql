/*
# Create app_updates table for update notifications

1. New Tables
- `app_updates`
  - `id` (uuid, primary key)
  - `version` (text, unique) - version string e.g. "1.0.5"
  - `title` (text) - update title
  - `description` (text) - update details/changelog
  - `created_at` (timestamptz) - when this update was published
  - `is_active` (boolean, default true) - whether this update is still active

2. Security
- Enable RLS on `app_updates`.
- Grant SELECT to `anon` + `authenticated` so all app users can see update notifications.
- Allow anon + authenticated SELECT because the data is intentionally public/shared (no-auth app).
- No INSERT/UPDATE/DELETE grants for anon/authenticated - only service_role can manage updates.
*/

CREATE TABLE IF NOT EXISTS app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE app_updates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON app_updates TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_updates" ON app_updates;
CREATE POLICY "anon_select_updates" ON app_updates FOR SELECT
TO anon, authenticated USING (true);
