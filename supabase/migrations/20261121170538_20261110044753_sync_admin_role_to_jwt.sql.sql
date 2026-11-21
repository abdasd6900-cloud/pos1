/*
# Sync admin role to auth.users metadata

## Why
The first-user-as-admin trigger sets `role = 'admin'` in the `profiles` table,
but RLS policies on `profiles`, `activation_keys` etc. check
`auth.jwt() -> 'raw_app_meta_data' ->> 'role'`. The JWT metadata is stored in
`auth.users.raw_app_meta_data`, which the profiles trigger does not touch.

## Change
- Create a SECURITY DEFINER function `sync_profile_role_to_auth()` that reads
  a profile row and updates `auth.users.raw_app_meta_data` to include the role.
- Attach it as an AFTER INSERT/UPDATE trigger on `profiles`.
- This means when the first-user-as-admin trigger sets role='admin', this
  trigger then propagates that into the JWT metadata. The user's next token
  refresh will carry the admin role.

## Security
- The function is SECURITY DEFINER, owned by the postgres role, so it can
  update auth.users. It only sets the `role` field in raw_app_meta_data,
  preserving any existing metadata keys.
- EXECUTE revoked from PUBLIC and anon; only the database/trigger can call it.
*/

CREATE OR REPLACE FUNCTION sync_profile_role_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  existing_meta jsonb;
BEGIN
  SELECT raw_app_meta_data INTO existing_meta FROM auth.users WHERE id = NEW.id;
  IF existing_meta IS NULL THEN
    existing_meta := '{}'::jsonb;
  END IF;
  existing_meta := jsonb_set(existing_meta, '{role}', to_jsonb(NEW.role), true);
  UPDATE auth.users SET raw_app_meta_data = existing_meta WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_profile_role_to_auth() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_sync_profile_role ON profiles;
CREATE TRIGGER trg_sync_profile_role
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_role_to_auth();