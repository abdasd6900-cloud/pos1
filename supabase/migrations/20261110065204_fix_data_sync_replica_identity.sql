-- Fix: data_sync table needs REPLICA IDENTITY for realtime updates
ALTER TABLE public.data_sync REPLICA IDENTITY FULL;
