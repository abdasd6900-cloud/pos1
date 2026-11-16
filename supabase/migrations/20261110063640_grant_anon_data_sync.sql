-- Grant anon role access to data_sync table
-- The app syncs data before the user is authenticated, using the anon key.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sync TO anon;
