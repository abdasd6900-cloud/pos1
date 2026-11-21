/*
# Fix administrator authorization policies

1. Purpose
- Corrects administrator checks to use the `app_metadata` claim that Supabase actually places in authenticated JWTs.
- Restores real activation-key creation, account administration, and key management for the administrator account.

2. Modified Policies
- `profiles_select_admin`
- `profiles_update_admin`
- `profiles_delete_admin`
- `keys_select_admin`
- `keys_insert_admin`
- `keys_update_admin`
- `keys_delete_admin`

3. Security
- Administrator access remains restricted to authenticated users whose server-controlled JWT contains `app_metadata.role = 'admin'`.
- No client-editable metadata is used.
- Existing own-profile and assigned-key policies remain unchanged.

4. Important Notes
- The previous policies checked `raw_app_meta_data`, which is a database column name and not the JWT claim name.
- This migration only replaces the broken claim path; it does not make data public.
*/

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "keys_select_admin" ON public.activation_keys;
CREATE POLICY "keys_select_admin" ON public.activation_keys
FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "keys_insert_admin" ON public.activation_keys;
CREATE POLICY "keys_insert_admin" ON public.activation_keys
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "keys_update_admin" ON public.activation_keys;
CREATE POLICY "keys_update_admin" ON public.activation_keys
FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "keys_delete_admin" ON public.activation_keys;
CREATE POLICY "keys_delete_admin" ON public.activation_keys
FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');