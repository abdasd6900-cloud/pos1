/*
# Create document-based real-time sync table

1. New Table
- `data_sync`: stores each data collection (products, customers, transactions, etc.) as a JSONB document keyed by collection name.
- `updated_at` tracks the last modification time.
- `updated_by` identifies which device made the change.

2. Design
- Each row is one collection (e.g. "products", "customers", "settings").
- The entire collection array/object is stored in `data` as JSONB.
- Devices push their local state when they make changes, and pull when they receive realtime updates.
- Echo prevention: each device tracks the last `updated_at` it pushed and ignores realtime events that match its own push.

3. Security
- RLS enabled. No auth screen in this app, so anon and authenticated roles share a single-business workspace.
- CRUD policies are separate per verb.

4. Realtime
- Table is added to the realtime publication so all devices receive changes instantly.
*/

CREATE TABLE IF NOT EXISTS public.data_sync (
  collection text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.data_sync ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sync TO anon, authenticated;

DROP POLICY IF EXISTS "shared_data_sync_select" ON public.data_sync;
CREATE POLICY "shared_data_sync_select" ON public.data_sync
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_data_sync_insert" ON public.data_sync;
CREATE POLICY "shared_data_sync_insert" ON public.data_sync
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shared_data_sync_update" ON public.data_sync;
CREATE POLICY "shared_data_sync_update" ON public.data_sync
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shared_data_sync_delete" ON public.data_sync;
CREATE POLICY "shared_data_sync_delete" ON public.data_sync
  FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'data_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.data_sync;
  END IF;
END $$;