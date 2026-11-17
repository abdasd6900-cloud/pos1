/*
# Harden device_heartbeats RLS policies

## Context
The device_heartbeats table was re-opened to anon with USING(true) policies
in a prior migration to allow connection indicators before auth loads.
This partially undid tenant isolation hardening.

## Changes
1. Drop the open USING(true) anon policies for INSERT, UPDATE, DELETE
2. Keep SELECT open to anon + authenticated (connection indicator needs to read)
3. Restrict INSERT, UPDATE, DELETE to authenticated only with auth.uid() = user_id
4. Add user_id column default if not already present
5. Revoke excess privileges from anon (keep SELECT only)
6. Grant authenticated full CRUD

## Security
- anon can READ heartbeats (connection indicator) but cannot write
- authenticated users can only write their own heartbeat rows
- user_id defaults to auth.uid() on insert
*/

-- Ensure user_id column exists with proper default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_heartbeats' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE device_heartbeats ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
END $$;

-- Revoke all from anon, then grant SELECT only
REVOKE ALL ON device_heartbeats FROM anon;
GRANT SELECT ON device_heartbeats TO anon;

-- Grant full CRUD to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON device_heartbeats TO authenticated;

-- Drop existing policies and recreate with proper scoping
DROP POLICY IF EXISTS "anon_select_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "anon_insert_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "anon_update_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "anon_delete_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "authenticated_select_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "authenticated_insert_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "authenticated_update_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "authenticated_delete_device_heartbeats" ON device_heartbeats;
DROP POLICY IF EXISTS "device_heartbeats_select_all" ON device_heartbeats;
DROP POLICY IF EXISTS "device_heartbeats_insert_all" ON device_heartbeats;
DROP POLICY IF EXISTS "device_heartbeats_update_all" ON device_heartbeats;
DROP POLICY IF EXISTS "device_heartbeats_delete_all" ON device_heartbeats;

-- SELECT: both anon and authenticated can read (connection indicator)
CREATE POLICY "device_heartbeats_select_open"
ON device_heartbeats FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT: only authenticated, own rows only
CREATE POLICY "device_heartbeats_insert_own"
ON device_heartbeats FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: only authenticated, own rows only
CREATE POLICY "device_heartbeats_update_own"
ON device_heartbeats FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: only authenticated, own rows only
CREATE POLICY "device_heartbeats_delete_own"
ON device_heartbeats FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
