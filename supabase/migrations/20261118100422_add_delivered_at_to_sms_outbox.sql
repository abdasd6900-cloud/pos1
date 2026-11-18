/*
# Add delivery tracking columns to sms_outbox

1. Modified Tables
- `sms_outbox`: adds `delivered_at` (timestamptz, nullable) and `delivery_status` (text, default 'sent')
  - `delivery_status` tracks the SMS delivery lifecycle: 'pending' → 'sent' → 'delivered' / 'failed'
  - `delivered_at` records when the Android device confirmed delivery via SmsDeliveryReceiver
  - The existing `status` column remains for the outbox processing lifecycle (pending/sent/failed)
  - `delivery_status` is the fine-grained delivery report that the web UI polls

2. Security
- No new tables created.
- No RLS policy changes — existing policies on sms_outbox remain unchanged.
- No grant changes needed.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_outbox' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE public.sms_outbox ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_outbox' AND column_name = 'delivery_status'
  ) THEN
    ALTER TABLE public.sms_outbox ADD COLUMN delivery_status text NOT NULL DEFAULT 'sent';
  END IF;
END $$;

-- Backfill existing rows so they show as 'sent' (their current status)
UPDATE public.sms_outbox SET delivery_status = 'sent' WHERE delivery_status IS NULL;
