/*
# Repair developer password identity

1. Purpose
- Restores the internal email identity record required by Supabase Auth for the existing developer account.
- Keeps the existing user ID and profile intact so no application data or relationships are changed.

2. Modified Auth Records
- `auth.identities`: adds the email identity only when it is missing for the developer account.
- `auth.users`: refreshes the developer password hash using bcrypt cost factor 10, which is accepted by GoTrue.

3. Security
- The identity is tied to the existing developer user ID and exact developer email.
- The operation is idempotent and does not create duplicate identity records.
- No new public tables, policies, or grants are added.

4. Important Notes
- This is a targeted repair for the existing developer account.
- No user-facing account data is deleted.
*/

DO $$
DECLARE
  dev_email text := '0000000000@sahab-pos.app';
  dev_user_id uuid;
BEGIN
  SELECT id INTO dev_user_id
  FROM auth.users
  WHERE email = dev_email;

  IF dev_user_id IS NULL THEN
    RAISE EXCEPTION 'Developer account does not exist';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt('dev-admin-2026', gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = dev_user_id;

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at
  )
  SELECT
    dev_email,
    dev_user_id,
    jsonb_build_object('sub', dev_user_id::text, 'email', dev_email),
    'email',
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.identities
    WHERE user_id = dev_user_id
      AND provider = 'email'
  );
END $$;