/*
# Fix data_sync query timeout

## Problem
The `data_sync` table was experiencing statement timeouts (57014) on SELECT queries
that use `ORDER BY updated_at DESC`. The table has only ~38 rows but some rows have
very large `data` jsonb columns (up to 379KB). The ORDER BY had no index, forcing
a full table scan + sort on every poll. Combined with concurrent upsert operations
holding row locks on large jsonb writes, queries were timing out.

## Changes
1. Add an index on `updated_at` to support the ORDER BY query pattern.
2. Drop the duplicate index `data_sync_collection_user_key` — it's identical to
   `data_sync_collection_user_uniq` and serves no purpose.

## Security
No RLS or policy changes. Existing policies remain intact.
*/

-- Add index on updated_at to support ORDER BY updated_at queries
CREATE INDEX IF NOT EXISTS data_sync_updated_at_idx
  ON public.data_sync (updated_at DESC);

-- Drop duplicate index (identical to data_sync_collection_user_uniq)
DROP INDEX IF EXISTS public.data_sync_collection_user_key;
