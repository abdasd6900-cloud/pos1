/*
# Add unique constraint on data_sync (collection, user_id)

1. Changes
- Drop the existing COALESCE-based unique index `data_sync_collection_user_unique`
  because it doesn't match PostgREST's `on_conflict=collection,user_id` specification.
- Create a standard UNIQUE constraint on `(collection, user_id)` so the upsert
  with `onConflict: 'collection,user_id'` resolves correctly.

2. Security
- No RLS or policy changes.
*/

DROP INDEX IF EXISTS data_sync_collection_user_unique;

CREATE UNIQUE INDEX IF NOT EXISTS data_sync_collection_user_key
  ON public.data_sync (collection, user_id);

ALTER TABLE public.data_sync
  DROP CONSTRAINT IF EXISTS data_sync_collection_user_uniq;

ALTER TABLE public.data_sync
  ADD CONSTRAINT data_sync_collection_user_uniq UNIQUE (collection, user_id);
