-- Step 1: Delete duplicate rows, keeping the one with the most data (rn=1)
-- On a fresh database there are no rows, so this is a no-op.
WITH ranked AS (
  SELECT ctid,
    collection,
    ROW_NUMBER() OVER (
      PARTITION BY collection
      ORDER BY
        CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_array_length(data) ELSE 0 END DESC,
        updated_at DESC
    ) as rn
  FROM data_sync
)
DELETE FROM data_sync
WHERE ctid IN (
  SELECT ctid FROM ranked WHERE rn > 1
);

-- Step 2: Add unique constraint on collection to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'data_sync_collection_unique' AND table_name = 'data_sync'
  ) THEN
    ALTER TABLE data_sync ADD CONSTRAINT data_sync_collection_unique UNIQUE (collection);
  END IF;
END $$;