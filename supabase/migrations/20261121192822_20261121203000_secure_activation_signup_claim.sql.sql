/*
# Secure activation-key signup claim

1. Purpose
- Ensures a newly signed-in user can consume an activation key only for their own profile.
- Preserves the existing atomic key claim and subscription assignment behavior.

2. Modified Function
- `consume_activation_key(text, uuid)` now rejects calls where the requested profile does not belong to `auth.uid()`.

3. Security
- The caller is derived from the authenticated session, never trusted from a client-supplied identity.
- The function remains `SECURITY DEFINER` only because it must atomically update protected subscription fields.
- Anonymous execution remains revoked; authenticated execution remains allowed for signup completion.

4. Important Notes
- Valid signup with a matching activation key continues to work.
- A key cannot be redirected to another user's profile through a crafted request.
*/

CREATE OR REPLACE FUNCTION public.consume_activation_key(
  p_key_code text,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_record RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_profile_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT * INTO key_record
  FROM public.activation_keys
  WHERE key_code = p_key_code
    AND is_used = false
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود التفعيل غير صحيح أو مستخدم مسبقاً');
  END IF;

  UPDATE public.activation_keys
  SET is_used = true,
      assigned_to = p_profile_id,
      assigned_at = now()
  WHERE id = key_record.id;

  UPDATE public.profiles
  SET activation_key = key_record.key_code,
      subscription_status = 'active',
      subscription_plan = key_record.plan,
      subscription_expires_at = CASE
        WHEN key_record.plan = 'lifetime' THEN NULL
        ELSE now() + (key_record.duration_days || ' days')::interval
      END
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'plan', key_record.plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_activation_key(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_activation_key(text, uuid) TO authenticated;