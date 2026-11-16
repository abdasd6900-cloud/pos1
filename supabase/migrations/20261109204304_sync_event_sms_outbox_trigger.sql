/*
# Create automatic SMS outbox trigger

1. Changed Objects
- `sync_events`: a database trigger now creates the related SMS outbox row whenever a new event contains both a phone number and message.

2. Reliability
- The trigger runs in the same database operation as the event insert, so an accepted event cannot be left without its delivery task.
- The unique event identifier keeps retries idempotent.

3. Security
- The trigger function uses a fixed public search path and is not exposed as a callable RPC.
*/

CREATE OR REPLACE FUNCTION public.enqueue_sync_event_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND btrim(NEW.phone) <> '' AND NEW.message IS NOT NULL AND btrim(NEW.message) <> '' THEN
    INSERT INTO public.sms_outbox (event_id, phone, message)
    VALUES (NEW.event_id, NEW.phone, NEW.message)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_event_sms_outbox ON public.sync_events;
CREATE TRIGGER sync_event_sms_outbox
AFTER INSERT ON public.sync_events
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_sync_event_sms();

REVOKE EXECUTE ON FUNCTION public.enqueue_sync_event_sms() FROM PUBLIC, anon, authenticated;