/*
# Fix device_heartbeats RLS policies

## Problem
The device_heartbeats table had user-scoped RLS policies (auth.uid() = user_id),
but heartbeats are device-level status records using fixed device IDs
('web-dashboard', 'android-phone') — not per-user data. When a different
user logs in on the same device, the existing row retains the previous
user's user_id, causing the UPDATE policy's USING check to fail with
"new row violates row-level security policy".

## Changes
- Drop the 4 user-scoped policies (hb_select_own, hb_insert_own, hb_update_own, hb_delete_own)
- Create 4 new policies allowing any authenticated user to manage all heartbeat rows,
  since heartbeats represent shared device connectivity status, not private user data.
- Grant remains: authenticated gets SELECT, INSERT, UPDATE, DELETE.
*/

ALTER TABLE device_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hb_select_own" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_insert_own" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_update_own" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_delete_own" ON device_heartbeats;

CREATE POLICY "hb_select_all" ON device_heartbeats FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "hb_insert_all" ON device_heartbeats FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "hb_update_all" ON device_heartbeats FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hb_delete_all" ON device_heartbeats FOR DELETE
  TO authenticated USING (true);
