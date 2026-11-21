/*
# Recreate developer account properly

## Why
The previous developer account was manually inserted into auth.users and may have
been missing internal fields required by the GoTrue auth service, causing a 500
"Database error querying schema" during login. This migration deletes and recreates
the account with all required fields, using the proper auth schema.

## Changes
1. Insert a new auth user for the developer account with all required fields.
2. Insert the corresponding profile row.
3. Set the admin role in raw_app_meta_data so JWT-based RLS policies work.
*/

DO $$
DECLARE
  dev_email text := '0000000000@sahab-pos.app';
  dev_user_id uuid;
  existing uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO existing FROM auth.users WHERE email = dev_email;
  IF existing IS NOT NULL THEN
    dev_user_id := existing;
  ELSE
    -- Create auth user with all required fields
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
      is_sso_user,
      is_anonymous,
      email_change_confirm_status,
      phone,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token
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
      false,
      false,
      0,
      '',
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO dev_user_id;
  END IF;

  -- Insert profile (the set_first_user_admin trigger will set role='admin' since
  -- this is the first profile, but we also set it explicitly to be safe)
  INSERT INTO profiles (id, phone, store_name, owner_name, role, subscription_status, subscription_plan, subscription_expires_at, is_active)
  VALUES (dev_user_id, '0000000000', 'حساب المطور', 'المطور', 'admin', 'active', 'lifetime', NULL, true)
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    subscription_status = 'active',
    subscription_plan = 'lifetime',
    subscription_expires_at = NULL,
    is_active = true;
END $$;
