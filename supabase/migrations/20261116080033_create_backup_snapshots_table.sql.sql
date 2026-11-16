/*
# Create backup_snapshots table

1. New Tables
- `backup_snapshots` — stores full data snapshots for cloud backup/restore
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users)
  - `label` (text, optional human-readable label for the snapshot)
  - `snapshot_data` (jsonb, the full backup payload)
  - `data_size` (integer, approximate byte size for display)
  - `created_at` (timestamptz, defaults to now())

2. Security
- Enable RLS on `backup_snapshots`.
- Grant CRUD to `authenticated` only (app requires sign-in).
- Owner-scoped: each user can only see/manage their own snapshots.
- 4 separate policies: select/insert/update/delete, all scoped by auth.uid() = user_id.
*/

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  snapshot_data jsonb NOT NULL,
  data_size integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON backup_snapshots TO authenticated;

DROP POLICY IF EXISTS "select_own_snapshots" ON backup_snapshots;
CREATE POLICY "select_own_snapshots"
ON backup_snapshots FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_snapshots" ON backup_snapshots;
CREATE POLICY "insert_own_snapshots"
ON backup_snapshots FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_snapshots" ON backup_snapshots;
CREATE POLICY "update_own_snapshots"
ON backup_snapshots FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_snapshots" ON backup_snapshots;
CREATE POLICY "delete_own_snapshots"
ON backup_snapshots FOR DELETE
TO authenticated USING (auth.uid() = user_id);
