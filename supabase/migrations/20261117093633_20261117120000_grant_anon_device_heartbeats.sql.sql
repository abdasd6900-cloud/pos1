-- device_heartbeats is a shared single-tenant table (device IDs like
-- "android-phone" / "web-dashboard") with no user-scoped data. The anon
-- role needs read/upsert access so the connection indicator works even
-- before the auth session is fully loaded on the web dashboard.

GRANT SELECT, INSERT, UPDATE, DELETE ON device_heartbeats TO anon;

DROP POLICY IF EXISTS "hb_select_anon" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_insert_anon" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_update_anon" ON device_heartbeats;
DROP POLICY IF EXISTS "hb_delete_anon" ON device_heartbeats;

CREATE POLICY "hb_select_anon" ON device_heartbeats
  FOR SELECT TO anon USING (true);
CREATE POLICY "hb_insert_anon" ON device_heartbeats
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "hb_update_anon" ON device_heartbeats
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "hb_delete_anon" ON device_heartbeats
  FOR DELETE TO anon USING (true);