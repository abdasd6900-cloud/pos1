/*
# Expand sync_events event_type CHECK constraint

1. Changes
- The `sync_events.event_type` CHECK constraint currently only allows
  'transaction', 'telecom_sale', 'manual_reply'.
- The dealer-portal edge function inserts 'dealer_recharge_request',
  'dealer_esim_request', and 'dealer_commission' event types — all
  silently rejected by the constraint.
- This migration drops the old constraint and adds a new one that
  includes all dealer-related event types.
2. Security
- No RLS or policy changes.
- No new tables or columns.
*/

ALTER TABLE sync_events DROP CONSTRAINT IF EXISTS sync_events_event_type_check;

ALTER TABLE sync_events ADD CONSTRAINT sync_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'transaction'::text,
    'telecom_sale'::text,
    'manual_reply'::text,
    'dealer_recharge_request'::text,
    'dealer_esim_request'::text,
    'dealer_commission'::text
  ]));
