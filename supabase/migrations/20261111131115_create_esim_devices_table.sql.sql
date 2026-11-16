/*
# Create eSIM device compatibility table

1. New Tables
- `esim_devices`
  - `id` (uuid, primary key)
  - `brand` (text) — device manufacturer (Apple, Samsung, Google, etc.)
  - `model` (text) — device model name (e.g. "iPhone 15 Pro", "Galaxy S24")
  - `supported` (boolean) — whether the device supports eSIM
  - `keywords` (text[]) — search keywords for matching (Arabic + English variants)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `esim_devices`.
- Grant SELECT to `anon` + `authenticated` so the app can query compatibility.
- Allow anon + authenticated SELECT because this is a shared reference table (no auth required).
- No INSERT/UPDATE/DELETE from the client — this is a read-only reference table.

3. Purpose
- The app checks incoming customer messages requesting eSIM, extracts the phone model,
  and queries this table to determine if the device supports eSIM.
- If not found locally, the app falls back to a built-in list in esim-checker.ts.
*/

CREATE TABLE IF NOT EXISTS esim_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  supported boolean NOT NULL DEFAULT true,
  keywords text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE esim_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON esim_devices TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_esim_devices" ON esim_devices;
CREATE POLICY "anon_select_esim_devices"
ON esim_devices FOR SELECT
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_esim_devices_model_lower ON esim_devices (lower(model));
