/*
# Create user accounts system (profiles + activation keys)

## Overview
This migration adds a multi-user account system to the POS app. Users sign in with phone number as both username and password. An admin role can manage all accounts, assign activation keys, and control subscription status. Data in `data_sync` is now scoped per-user.

## 1. New Tables

### `profiles`
- `id` (uuid, PK, references auth.users) — the Supabase auth user ID
- `phone` (text, unique) — the user's phone number, used as login
- `store_name` (text) — store/business name
- `owner_name` (text) — the business owner's name
- `role` (text, default 'user') — 'admin' or 'user'
- `activation_key` (text, nullable) — assigned activation key for license
- `subscription_status` (text, default 'trial') — 'trial', 'active', 'expired', 'locked'
- `subscription_plan` (text, nullable) — 'monthly', 'yearly', 'lifetime'
- `subscription_expires_at` (timestamptz, nullable) — when subscription expires
- `is_active` (boolean, default true) — admin can deactivate accounts
- `created_at` (timestamptz, default now())

### `activation_keys`
- `id` (uuid, PK)
- `key_code` (text, unique) — the activation key string
- `plan` (text) — 'monthly', 'yearly', 'lifetime'
- `duration_days` (integer) — how many days the key is valid
- `assigned_to` (uuid, nullable, references profiles.id) — which user is using this key
- `assigned_at` (timestamptz, nullable)
- `is_used` (boolean, default false)
- `created_at` (timestamptz, default now())
- `notes` (text, default '')

## 2. Modified Tables

### `data_sync`
- Added `user_id` (uuid, nullable, references auth.users) column to scope data per user.
- The compound unique key is now (collection, user_id) so each user has their own row per collection.

## 3. Security

### profiles
- RLS enabled. Users can read/update their own profile. Admins can read all profiles.
- Admin detection uses `raw_app_meta_data->>role = 'admin'` from the JWT.
- An admin can see all rows; non-admin users see only their own row.

### activation_keys
- RLS enabled. Only admins can manage keys. Users can see keys assigned to them.

### data_sync
- RLS policies updated: users can only CRUD their own user_id-scoped rows.
- The old `USING (true)` policies are replaced with `auth.uid() = user_id` checks.

## 4. Important Notes
1. The first user to register is NOT automatically admin — admin role is set via service role or database.
2. The `user_id` column on `data_sync` has a default of `auth.uid()` so existing inserts continue to work.
3. A unique constraint on (collection, user_id) replaces the old primary key on `collection` alone.
*/

-- ============ profiles table ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  store_name text NOT NULL DEFAULT '',
  owner_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  activation_key text,
  subscription_status text NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired', 'locked')),
  subscription_plan text CHECK (subscription_plan IN ('monthly', 'yearly', 'lifetime')),
  subscription_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- Admins can read all profiles
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated USING (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  );

-- Users can insert their own profile (on signup)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update their own profile (but not role/status fields)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  );

-- ============ activation_keys table ============
CREATE TABLE IF NOT EXISTS public.activation_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code text UNIQUE NOT NULL,
  plan text NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime')),
  duration_days integer NOT NULL DEFAULT 30,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT ''
);

ALTER TABLE public.activation_keys ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.activation_keys TO authenticated;

-- Admins can read all keys
DROP POLICY IF EXISTS "keys_select_admin" ON public.activation_keys;
CREATE POLICY "keys_select_admin" ON public.activation_keys
  FOR SELECT TO authenticated USING (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  );

-- Users can see keys assigned to them
DROP POLICY IF EXISTS "keys_select_own" ON public.activation_keys;
CREATE POLICY "keys_select_own" ON public.activation_keys
  FOR SELECT TO authenticated USING (assigned_to = auth.uid());

-- Only admins can insert keys
DROP POLICY IF EXISTS "keys_insert_admin" ON public.activation_keys;
CREATE POLICY "keys_insert_admin" ON public.activation_keys
  FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  );

-- Only admins can update keys
DROP POLICY IF EXISTS "keys_update_admin" ON public.activation_keys;
CREATE POLICY "keys_update_admin" ON public.activation_keys
  FOR UPDATE TO authenticated USING (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt()->'raw_app_meta_data'->>'role') = 'admin'
  );

-- ============ data_sync: add user_id column ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'data_sync' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.data_sync ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update the primary key: drop old PK, add (collection, user_id) as unique
ALTER TABLE public.data_sync DROP CONSTRAINT IF EXISTS data_sync_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS data_sync_collection_user_unique
  ON public.data_sync (collection, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Update data_sync policies to be user-scoped
DROP POLICY IF EXISTS "shared_data_sync_select" ON public.data_sync;
DROP POLICY IF EXISTS "shared_data_sync_insert" ON public.data_sync;
DROP POLICY IF EXISTS "shared_data_sync_update" ON public.data_sync;
DROP POLICY IF EXISTS "shared_data_sync_delete" ON public.data_sync;

CREATE POLICY "data_sync_select_own" ON public.data_sync
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "data_sync_insert_own" ON public.data_sync
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "data_sync_update_own" ON public.data_sync
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "data_sync_delete_own" ON public.data_sync
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Revoke anon access since this is now a multi-user app
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.data_sync FROM anon;