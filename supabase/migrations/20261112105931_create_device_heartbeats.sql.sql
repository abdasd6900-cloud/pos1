/*
# Create device_heartbeats table for connection status tracking

1. New Tables
- `device_heartbeats`
  - `device_id` (text, primary key) — identifies the device ("android-phone", "web-dashboard")
  - `device_type` (text) — "android" or "web"
  - `last_seen` (timestamptz) — last time the device sent a heartbeat
  - `device_info` (jsonb, nullable) — optional metadata (app version, battery, etc.)

2. Purpose
- The Android app (SmsGatewayService) sends a heartbeat every 15 seconds.
- The web dashboard sends a heartbeat every 15 seconds.
- Each side reads the other's last_seen to determine if the connection is alive.
- A device is considered "online" if its last_seen is within the last 45 seconds.

3. Security
- Enable RLS on `device_heartbeats`.
- Grant CRUD to `anon, authenticated` — this is a shared single-tenant table with no user-scoped data.
- All policies use `USING (true)` / `WITH CHECK (true)` because heartbeats are intentionally public/shared.
*/

CREATE TABLE IF NOT EXISTS device_heartbeats (
  device_id text PRIMARY KEY,
  device_type text NOT NULL DEFAULT 'android',
  last_seen timestamptz NOT NULL DEFAULT now(),
  device_info jsonb
);

ALTER TABLE device_heartbeats ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON device_heartbeats TO anon, authenticated;

DROP POLICY IF EXISTS "hb_select" ON device_heartbeats;
CREATE POLICY "hb_select" ON device_heartbeats
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "hb_insert" ON device_heartbeats;
CREATE POLICY "hb_insert" ON device_heartbeats
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "hb_update" ON device_heartbeats;
CREATE POLICY "hb_update" ON device_heartbeats
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hb_delete" ON device_heartbeats;
CREATE POLICY "hb_delete" ON device_heartbeats
  FOR DELETE TO anon, authenticated USING (true);
