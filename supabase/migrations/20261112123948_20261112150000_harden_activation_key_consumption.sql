/*
# Harden activation key consumption authorization

1. Purpose
- Ensure an authenticated user can only consume an activation key for their own profile.
- Preserve the existing atomic key lock and subscription update behavior.

2. Modified database object
- `public.consume_activation_key(text, uuid)` now rejects calls when the supplied profile ID does not match `auth.uid()`.

3. Security changes
- Prevents a signed-in client from assigning a valid activation key to another profile.
- Keeps the function SECURITY DEFINER with its existing fixed search path because it must update protected subscription fields.
- Keeps execution limited to authenticated users.

4. Data safety
- No tables, columns, or existing records are deleted or changed by this migration.
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
  profile_exists boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_profile_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = p_profile_id
  ) INTO profile_exists;

  IF NOT profile_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير موجود');
  END IF;

  SELECT * INTO key_record
  FROM activation_keys
  WHERE key_code = p_key_code AND is_used = false
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود التفعيل غير صحيح أو مستخدم مسبقاً');
  END IF;

  UPDATE activation_keys
  SET is_used = true, assigned_to = p_profile_id, assigned_at = now()
  WHERE id = key_record.id;

  UPDATE profiles
  SET
    activation_key = key_record.key_code,
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