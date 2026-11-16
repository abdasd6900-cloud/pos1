/*
# Fix Security Grants and Policies

## Summary
This migration fixes several over-broad grants and a missing grant that were identified
during a comprehensive security audit. No data is lost; only privileges are tightened.

## Changes

### 1. app_updates table — revoke write grants from anon
The `anon` role had INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES on `app_updates`.
Only a SELECT policy exists (USING true), so writes are blocked by RLS, but the grants
themselves are unnecessary and violate least-privilege. Revoke all write privileges
from anon; keep SELECT so the app can check for updates.

### 2. esim_devices table — revoke write grants from anon
The `anon` role had full CRUD on `esim_devices`. Only a SELECT policy exists
(USING true). Revoke INSERT, UPDATE, DELETE, TRUNCATE from anon. Authenticated
users retain their CRUD via existing policies.

### 3. profiles table — add UPDATE grant for authenticated
The `authenticated` role had SELECT, INSERT, DELETE but NOT UPDATE on `profiles`,
even though `profiles_update_own` and `profiles_update_admin` policies exist.
Without the UPDATE grant, users cannot update their own profile through the Data API.
Add UPDATE grant so the existing policies can function.

### 4. activation_keys table — revoke unnecessary grants from anon
The `anon` role had REFERENCES, TRIGGER, TRUNCATE on `activation_keys`. These are
unnecessary for the anon role. Revoke them.

### 5. data_sync table — revoke write grants from anon
The `anon` role had full CRUD on `data_sync`. The policies use `auth.uid() = user_id`,
which requires authentication. Anon cannot satisfy this check (auth.uid() is NULL),
so writes are already blocked by RLS, but the grants violate least-privilege.
Revoke INSERT, UPDATE, DELETE, TRUNCATE from anon. Keep SELECT so anon can read
public sync data if needed (though the policy already scopes to auth.uid()).

### 6. device_heartbeats — revoke unnecessary grants from anon
The `anon` role had REFERENCES, TRIGGER, TRUNCATE. Revoke these.

### 7. sms_inbox_events, sms_outbox, sync_events — revoke unnecessary grants from anon
These tables had REFERENCES, TRIGGER, TRUNCATE granted to anon unnecessarily.
Revoke them.

## Security Impact
- Tightens anon role to least-privilege across all tables
- Fixes missing UPDATE grant on profiles for authenticated users
- No existing functionality is broken: all legitimate flows use authenticated role
*/

-- 1. app_updates: anon keeps SELECT only
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app_updates FROM anon;

-- 2. esim_devices: anon keeps SELECT only
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON esim_devices FROM anon;

-- 3. profiles: add UPDATE grant for authenticated (was missing)
GRANT UPDATE ON profiles TO authenticated;

-- 4. activation_keys: remove unnecessary anon grants
REVOKE REFERENCES, TRIGGER, TRUNCATE ON activation_keys FROM anon;

-- 5. data_sync: anon keeps SELECT only
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON data_sync FROM anon;

-- 6. device_heartbeats: remove unnecessary anon grants
REVOKE REFERENCES, TRIGGER, TRUNCATE ON device_heartbeats FROM anon;

-- 7. sms_inbox_events, sms_outbox, sync_events: remove unnecessary anon grants
REVOKE REFERENCES, TRIGGER, TRUNCATE ON sms_inbox_events FROM anon;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON sms_outbox FROM anon;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON sync_events FROM anon;
