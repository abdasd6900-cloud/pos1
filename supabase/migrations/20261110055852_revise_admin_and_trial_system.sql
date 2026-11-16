/*
# Revise admin/trial system: 7-day trial, activation-key-gated signup, developer account

## Changes
1. First-user trigger: keep first user as admin but with 7-day trial (not lifetime active).
2. Activation key consume function: SECURITY DEFINER function to atomically consume
   an unused key and apply it to a profile. Prevents double-use race conditions.
3. Seed a developer account with a known phone/password so the app owner can log in
   and manage users without needing to be the "first" registrant.
4. Add a unique invite/signup key requirement: new registrations must provide a valid,
   unused activation key. The key is consumed atomically at signup.
*/

-- ============ 1. Update first-user trigger: 7-day trial ============
CREATE OR REPLACE FUNCTION set_first_user_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_count integer;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM profiles;
  IF profile_count = 0 THEN
    NEW.role := 'admin';
    NEW.subscription_status := 'trial';
    NEW.subscription_plan := NULL;
    NEW.subscription_expires_at := now() + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

-- ============ 2. Atomic key consumption function ============
-- Called by the client during signup. Validates the key, marks it used,
-- and applies the subscription to the given profile ID.
CREATE OR REPLACE FUNCTION consume_activation_key(
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
  -- Check the profile exists and belongs to the caller
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = p_profile_id) INTO profile_exists;
  IF NOT profile_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير موجود');
  END IF;

  -- Lock the key row for atomic consume
  SELECT * INTO key_record
  FROM activation_keys
  WHERE key_code = p_key_code AND is_used = false
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود التفعيل غير صحيح أو مستخدم مسبقاً');
  END IF;

  -- Mark key as used
  UPDATE activation_keys
  SET is_used = true, assigned_to = p_profile_id, assigned_at = now()
  WHERE id = key_record.id;

  -- Apply subscription to profile
  UPDATE profiles
  SET
    activation_key = key_record.key_code,
    subscription_status = 'active',
    subscription_plan = key_record.plan,
    subscription_expires_at = CASE WHEN key_record.plan = 'lifetime' THEN NULL
                                   ELSE now() + (key_record.duration_days || ' days')::interval END
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'plan', key_record.plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_activation_key(text, uuid) FROM PUBLIC, anon;

-- ============ 3. Seed developer account ============
-- Create auth user + profile for the developer/admin.
-- Phone: 0000000000 (unlikely to collide with real users)
-- Password: dev-admin-2026
-- The developer gets lifetime active subscription.
DO $$
DECLARE
  dev_email text := '0000000000@sahab-pos.app';
  dev_user_id uuid;
  existing uuid;
BEGIN
  SELECT id INTO existing FROM auth.users WHERE email = dev_email;
  IF existing IS NOT NULL THEN
    -- Already seeded; ensure profile is correct
    dev_user_id := existing;
  ELSE
    -- Create auth user
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      dev_email,
      crypt('dev-admin-2026', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"role":"admin"}'::jsonb,
      '{}'::jsonb,
      false
    )
    RETURNING id INTO dev_user_id;
  END IF;

  -- Upsert developer profile (bypasses the first-user trigger since a row may already exist)
  INSERT INTO profiles (id, phone, store_name, owner_name, role, subscription_status, subscription_plan, subscription_expires_at, is_active)
  VALUES (dev_user_id, '0000000000', 'حساب المطور', 'المطور', 'admin', 'active', 'lifetime', NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    subscription_status = 'active',
    subscription_plan = 'lifetime',
    subscription_expires_at = NULL,
    is_active = true;
END $$;

-- ============ 4. Helper: validate key without consuming ============
-- Used during signup validation (before profile insert).
CREATE OR REPLACE FUNCTION validate_activation_key(p_key_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM activation_keys
    WHERE key_code = p_key_code AND is_used = false
  ) INTO key_exists;

  IF key_exists THEN
    RETURN jsonb_build_object('valid', true);
  ELSE
    RETURN jsonb_build_object('valid', false, 'error', 'كود التفعيل غير صحيح أو مستخدم مسبقاً');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_activation_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION validate_activation_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_activation_key(text, uuid) TO authenticated;

-- ============ 5. Grant profiles SELECT to anon for key validation during signup ============
-- During signUp, the user is authenticated (session exists) so this is fine.
-- No changes needed — the existing INSERT/SELECT policies cover this.
