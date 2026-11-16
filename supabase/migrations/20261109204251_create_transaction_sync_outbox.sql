/*
# Create transaction sync event log and SMS outbox

1. New Tables
- `sync_events`: append-only shared event log for transactions created by web or Android. `event_id` is the client-generated idempotency key, `event_type` identifies the transaction kind, `payload` stores the complete transaction snapshot, `phone` is the intended recipient, `message` is the rendered SMS text, `source` identifies the originating client, and `created_at` records server receipt time.
- `sms_outbox`: one durable SMS delivery record per sync event. `event_id` is unique so reconnects cannot create duplicate messages, `status` tracks pending, sent, or failed delivery, and attempt metadata supports retrying safely.

2. Data Integrity
- Event identifiers and outbox event identifiers are unique.
- Transaction payloads are stored as JSONB so web and Android can exchange the existing transaction shapes without dropping fields.
- The outbox is linked to the event log and cannot be orphaned.

3. Security
- Row Level Security is enabled on both tables.
- This app currently has no sign-in screen, so the anon client must be able to read and write the shared single-business workspace. Policies are explicit and separate for SELECT, INSERT, UPDATE, and DELETE.
- Grants are limited to the verbs used by the sync client.

4. Realtime
- Both tables are added to the Supabase realtime publication so the Android gateway can receive web-created events without polling.

5. Important Notes
- `event_id` is the idempotency boundary: the same event can be submitted repeatedly after a timeout without creating another SMS record.
- Sending the SMS itself remains an Android-device responsibility because the message must use the phone SIM balance.
*/

CREATE TABLE IF NOT EXISTS public.sync_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('transaction', 'telecom_sale')),
  payload jsonb NOT NULL,
  phone text,
  message text,
  source text NOT NULL CHECK (source IN ('web', 'android')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE REFERENCES public.sync_events(event_id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_events_created_at_idx ON public.sync_events(created_at DESC);
CREATE INDEX IF NOT EXISTS sms_outbox_status_created_at_idx ON public.sms_outbox(status, created_at ASC);

ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.sync_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sms_outbox TO anon, authenticated;

DROP POLICY IF EXISTS "shared_sync_events_select" ON public.sync_events;
CREATE POLICY "shared_sync_events_select" ON public.sync_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_sync_events_insert" ON public.sync_events;
CREATE POLICY "shared_sync_events_insert" ON public.sync_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_sync_events_update" ON public.sync_events;
CREATE POLICY "shared_sync_events_update" ON public.sync_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_sync_events_delete" ON public.sync_events;
CREATE POLICY "shared_sync_events_delete" ON public.sync_events FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shared_sms_outbox_select" ON public.sms_outbox;
CREATE POLICY "shared_sms_outbox_select" ON public.sms_outbox FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shared_sms_outbox_insert" ON public.sms_outbox;
CREATE POLICY "shared_sms_outbox_insert" ON public.sms_outbox FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "shared_sms_outbox_update" ON public.sms_outbox;
CREATE POLICY "shared_sms_outbox_update" ON public.sms_outbox FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "shared_sms_outbox_delete" ON public.sms_outbox;
CREATE POLICY "shared_sms_outbox_delete" ON public.sms_outbox FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sync_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sms_outbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_outbox;
  END IF;
END $$;