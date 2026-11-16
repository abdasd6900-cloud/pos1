/*
# Harden Security: Tenant Isolation, Profile Column Locking, Key Validation Removal

## Summary
This migration fixes critical security vulnerabilities:
1. Isolates shared tables (sync_events, sms_outbox, sms_inbox_events, device_heartbeats) by user_id
2. Fixes data_sync unique constraint conflict that caused cross-tenant data overwrites
3. Locks profiles sensitive columns (role, subscription_*, is_active, activation_key) so users cannot self-escalate
4. Creates admin SECURITY DEFINER functions for privileged profile operations
5. Drops the validate_activation_key RPC (key enumeration oracle)
6. Updates the sms_outbox trigger to propagate user_id

## Important Notes
1. Shared tables get user_id column with DEFAULT auth.uid()
2. anon role is revoked on shared tables — native Android code must use the user's access token
3. The trigger function is updated to copy user_id from sync_events to sms_outbox
4. profiles UPDATE is column-restricted: users can only update store_name, owner_name, phone
5. Admin operations (role change, subscription, activation) go through SECURITY DEFINER functions
6. The dev account removal is done separately via execute_sql (not in migrations per policy)
*/

-- ============================================================
-- 1. Fix data_sync: drop the conflicting UNIQUE(collection) constraint
-- ============================================================
ALTER TABLE public.data_sync DROP CONSTRAINT IF EXISTS data_sync_collection_unique;

-- ============================================================
-- 2. Add user_id to shared tables and isolate by tenant
-- ============================================================

-- sync_events: add user_id
ALTER TABLE public.sync_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sync_events ALTER COLUMN user_id SET DEFAULT auth.uid();

-- sms_outbox: add user_id
ALTER TABLE public.sms_outbox ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sms_outbox ALTER COLUMN user_id SET DEFAULT auth.uid();

-- sms_inbox_events: add user_id
ALTER TABLE public.sms_inbox_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sms_inbox_events ALTER COLUMN user_id SET DEFAULT auth.uid();

-- device_heartbeats: add user_id (device_id remains PK)
ALTER TABLE public.device_heartbeats ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.device_heartbeats ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ============================================================
-- 3. Revoke anon access on shared tables (security: anon key is public)
-- ============================================================
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sync_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sms_outbox FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sms_inbox_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.device_heartbeats FROM anon;

-- Re-grant to authenticated only
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_inbox_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_heartbeats TO authenticated;

-- ============================================================
-- 4. Drop old USING(true) policies and create user-scoped ones
-- ============================================================

-- sync_events
DROP POLICY IF EXISTS "shared_sync_events_select" ON public.sync_events;
DROP POLICY IF EXISTS "shared_sync_events_insert" ON public.sync_events;
DROP POLICY IF EXISTS "shared_sync_events_update" ON public.sync_events;
DROP POLICY IF EXISTS "shared_sync_events_delete" ON public.sync_events;

CREATE POLICY "sync_events_select_own" ON public.sync_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sync_events_insert_own" ON public.sync_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sync_events_update_own" ON public.sync_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sync_events_delete_own" ON public.sync_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- sms_outbox
DROP POLICY IF EXISTS "shared_sms_outbox_select" ON public.sms_outbox;
DROP POLICY IF EXISTS "shared_sms_outbox_insert" ON public.sms_outbox;
DROP POLICY IF EXISTS "shared_sms_outbox_update" ON public.sms_outbox;
DROP POLICY IF EXISTS "shared_sms_outbox_delete" ON public.sms_outbox;

CREATE POLICY "sms_outbox_select_own" ON public.sms_outbox FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sms_outbox_insert_own" ON public.sms_outbox FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sms_outbox_update_own" ON public.sms_outbox FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sms_outbox_delete_own" ON public.sms_outbox FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- sms_inbox_events
DROP POLICY IF EXISTS "sms_events_delete" ON public.sms_inbox_events;
DROP POLICY IF EXISTS "sms_events_insert" ON public.sms_inbox_events;
DROP POLICY IF EXISTS "sms_events_select" ON public.sms_inbox_events;
DROP POLICY IF EXISTS "sms_events_update" ON public.sms_inbox_events;

CREATE POLICY "sms_inbox_select_own" ON public.sms_inbox_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sms_inbox_insert_own" ON public.sms_inbox_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sms_inbox_update_own" ON public.sms_inbox_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sms_inbox_delete_own" ON public.sms_inbox_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- device_heartbeats
DROP POLICY IF EXISTS "hb_delete" ON public.device_heartbeats;
DROP POLICY IF EXISTS "hb_insert" ON public.device_heartbeats;
DROP POLICY IF EXISTS "hb_select" ON public.device_heartbeats;
DROP POLICY IF EXISTS "hb_update" ON public.device_heartbeats;

CREATE POLICY "hb_select_own" ON public.device_heartbeats FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hb_insert_own" ON public.device_heartbeats FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hb_update_own" ON public.device_heartbeats FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hb_delete_own" ON public.device_heartbeats FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. Lock profiles sensitive columns
-- ============================================================
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (store_name, owner_name, phone) ON public.profiles TO authenticated;

-- ============================================================
-- 6. Create admin SECURITY DEFINER functions for privileged profile ops
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_profile_role(p_target_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_is_admin boolean;
  valid_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF p_role NOT IN ('admin', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'دور غير صالح');
  END IF;

  UPDATE profiles SET role = p_role WHERE id = p_target_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_profile_status(p_target_id uuid, p_is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  UPDATE profiles SET is_active = p_is_active WHERE id = p_target_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_status(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_activation_key(p_key_id uuid, p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_is_admin boolean;
  key_record RECORD;
  expires_at timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT * INTO key_record FROM activation_keys WHERE id = p_key_id AND is_used = false FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير موجود أو مستخدم مسبقاً');
  END IF;

  expires_at := CASE
    WHEN key_record.plan = 'lifetime' THEN NULL
    ELSE now() + (key_record.duration_days || ' days')::interval
  END;

  UPDATE activation_keys
  SET is_used = true, assigned_to = p_target_id, assigned_at = now()
  WHERE id = p_key_id;

  UPDATE profiles
  SET activation_key = key_record.key_code,
      subscription_status = 'active',
      subscription_plan = key_record.plan,
      subscription_expires_at = expires_at
  WHERE id = p_target_id;

  RETURN jsonb_build_object('success', true, 'plan', key_record.plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_activation_key(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_activation_key(uuid, uuid) TO authenticated;

-- ============================================================
-- 7. Drop validate_activation_key (key enumeration oracle)
-- ============================================================
DROP FUNCTION IF EXISTS public.validate_activation_key(text);

-- ============================================================
-- 8. Update trigger to propagate user_id to sms_outbox
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_sync_event_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source = 'web'
  AND NEW.phone IS NOT NULL
  AND btrim(NEW.phone) <> ''
  AND NEW.message IS NOT NULL
  AND btrim(NEW.message) <> '' THEN
    INSERT INTO public.sms_outbox (event_id, phone, message, user_id)
    VALUES (NEW.event_id, NEW.phone, NEW.message, NEW.user_id)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
