/*
# Limit automatic SMS queueing to web-originated events

1. Changed Objects
- `enqueue_sync_event_sms`: the trigger now queues SMS only for events created by the web app.

2. Important Notes
- Android-originated sales already use the SIM gateway directly and must not be queued again, preventing duplicate SMS messages when realtime echoes the event back to the same device.
*/

CREATE OR REPLACE FUNCTION public.enqueue_sync_event_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'web'
    AND NEW.phone IS NOT NULL
    AND btrim(NEW.phone) <> ''
    AND NEW.message IS NOT NULL
    AND btrim(NEW.message) <> '' THEN
    INSERT INTO public.sms_outbox (event_id, phone, message)
    VALUES (NEW.event_id, NEW.phone, NEW.message)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_sync_event_sms() FROM PUBLIC, anon, authenticated;