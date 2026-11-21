/*
# Fix user accounts system — data_sync scoping, first-admin trigger, grant cleanup

## Changes

### 1. data_sync.user_id default
- Add `DEFAULT auth.uid()` to `data_sync.user_id` so client inserts that omit
  `user_id` still satisfy the INSERT RLS policy `WITH CHECK (auth.uid() = user_id)`.

### 2. First-user-as-admin trigger
- Create a `BEFORE INSERT` trigger on `profiles` that checks if the table is
  empty (no profiles exist yet). If so, sets `role = 'admin'` for that first
  row. This ensures the first person to sign up becomes the admin automatically,
  without needing manual SQL. Subsequent signups get `role = 'user'` (the
  default already in the insert from the app).

### 3. Grant cleanup
- `profiles` and `activation_keys` still had `anon` CRUD grants from the
  original migration. Since this app now requires sign-in, remove `anon`
  grants and keep only `authenticated`.

### 4. activation_keys DELETE policy
- The activation_keys table was missing a DELETE policy for admins. Add one
  so admins can delete keys from the admin panel.

### 5. profiles DELETE policy for admins
- Add a DELETE policy so admins can delete user accounts if needed.
*/

-- 1. Add DEFAULT auth.uid() to data_sync.user_id
ALTER TABLE data_sync
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. First-user-as-admin trigger function
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
    NEW.subscription_status := 'active';
    NEW.subscription_plan := 'lifetime';
    NEW.subscription_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_first_user_admin ON profiles;
CREATE TRIGGER trg_first_user_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_first_user_admin();

REVOKE EXECUTE ON FUNCTION set_first_user_admin() FROM PUBLIC, anon;

-- 3. Grant cleanup: remove anon from profiles and activation_keys
REVOKE SELECT, INSERT, UPDATE, DELETE ON profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON activation_keys FROM anon;

-- 4. activation_keys DELETE policy for admins
DROP POLICY IF EXISTS "keys_delete_admin" ON activation_keys;
CREATE POLICY "keys_delete_admin"
ON activation_keys FOR DELETE
TO authenticated
USING ((auth.jwt() -> 'raw_app_meta_data'::text) ->> 'role' = 'admin');

-- 5. profiles DELETE policy for admins
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin"
ON profiles FOR DELETE
TO authenticated
USING ((auth.jwt() -> 'raw_app_meta_data'::text) ->> 'role' = 'admin');