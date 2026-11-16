/*
# Add atomic inbox claim function

1. New Functions
- `claim_sms_inbox_events(p_limit int)` — SECURITY DEFINER function that atomically
  claims up to `p_limit` unprocessed rows from `sms_inbox_events` for the calling user.
  Marks them as processed and returns the claimed rows. This replaces the
  check-then-act pattern (SELECT unprocessed → UPDATE processed) that caused
  race conditions across concurrent polls.

2. Security
- SECURITY DEFINER with SET search_path = public
- Checks auth.uid() = user_id so users can only claim their own events
- REVOKE EXECUTE from anon, GRANT to authenticated only
*/

CREATE OR REPLACE FUNCTION public.claim_sms_inbox_events(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH claimed AS (
    SELECT id FROM sms_inbox_events
    WHERE user_id = v_user_id AND processed = false
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sms_inbox_events
  SET processed = true, processed_at = now()
  WHERE id IN (SELECT id FROM claimed)
  RETURNING to_jsonb(sms_inbox_events.*) INTO v_rows;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_sms_inbox_events(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_sms_inbox_events(int) TO authenticated;
