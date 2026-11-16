/*
# Add manual_reply event type for SMS inbox replies

1. Changed Objects
- `sync_events`: the `event_type` CHECK constraint now also allows 'manual_reply' so the web app can enqueue
  manual SMS replies from the embedded inbox. The trigger `enqueue_sync_event_sms` already fires for any
  web-originated event with a phone and message, so no trigger changes are needed.

2. Important Notes
- This is backward-compatible: existing 'transaction' and 'telecom_sale' events are unaffected.
- The Android SmsGatewayService polls sms_outbox and sends any pending row regardless of event_type,
  so manual replies will be picked up automatically.
*/

ALTER TABLE public.sync_events DROP CONSTRAINT IF EXISTS sync_events_event_type_check;
ALTER TABLE public.sync_events ADD CONSTRAINT sync_events_event_type_check
  CHECK (event_type IN ('transaction', 'telecom_sale', 'manual_reply'));
