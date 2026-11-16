/*
# Create sms_inbox_events table — real-time SMS event queue

## Problem
The existing `data_sync` table uses `collection` as PRIMARY KEY. When the Android
phone receives an SMS, it INSERTs a row with `collection = 'customerReplies'`.
After the first insert, every subsequent INSERT fails (primary key violation)
and the error is silently caught in Java — meaning only the FIRST SMS ever reaches
the computer. All later SMS messages are lost.

## Solution
Create a dedicated append-only event queue table `sms_inbox_events` where each
row is one individual SMS event. The Android phone INSERTs a new row per SMS,
and the web dashboard polls/subscribes to pick up new events in real time.

## New Table
- `sms_inbox_events`
  - `id` (bigserial, primary key) — auto-incrementing event ID
  - `event_type` (text) — "customerReply" or "pendingOperation"
  - `sender_phone` (text) — phone number of the SMS sender
  - `message` (text) — full SMS body
  - `sim_number` (text, nullable) — extracted SIM/phone number from message
  - `source` (text, nullable) — "sms" or "whatsapp"
  - `channel` (text, nullable) — message channel
  - `processed` (boolean, default false) — whether the web dashboard has consumed this event
  - `processed_at` (timestamptz, nullable) — when the event was consumed
  - `created_at` (timestamptz, default now()) — when the event was inserted

## Security
- RLS enabled. This is a single-tenant no-auth app, so anon + authenticated share access.
- CRUD granted to anon + authenticated.
- Added to supabase_realtime publication for instant push to subscribers.

## Indexes
- Index on `processed` + `created_at` for efficient polling of unprocessed events.
- Index on `created_at` for ordering.
*/

CREATE TABLE IF NOT EXISTS public.sms_inbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_type text NOT NULL DEFAULT 'customerReply',
  sender_phone text NOT NULL,
  message text NOT NULL,
  sim_number text,
  source text DEFAULT 'sms',
  channel text,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_inbox_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_inbox_events TO anon, authenticated;

-- Sequence grant for bigserial
GRANT USAGE ON SEQUENCE sms_inbox_events_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "sms_events_select" ON public.sms_inbox_events;
CREATE POLICY "sms_events_select" ON public.sms_inbox_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sms_events_insert" ON public.sms_inbox_events;
CREATE POLICY "sms_events_insert" ON public.sms_inbox_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sms_events_update" ON public.sms_inbox_events;
CREATE POLICY "sms_events_update" ON public.sms_inbox_events
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sms_events_delete" ON public.sms_inbox_events;
CREATE POLICY "sms_events_delete" ON public.sms_inbox_events
  FOR DELETE TO anon, authenticated USING (true);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_sms_events_unprocessed ON public.sms_inbox_events (created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_sms_events_created ON public.sms_inbox_events (created_at DESC);

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sms_inbox_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_inbox_events;
  END IF;
END $$;
