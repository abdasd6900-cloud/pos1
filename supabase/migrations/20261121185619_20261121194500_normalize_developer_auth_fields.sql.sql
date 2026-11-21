/*
# Normalize developer Auth fields

1. Purpose
- Repairs internal text fields on the existing developer account that were left NULL by a manual Auth record insert.
- Supabase Auth requires these token and state fields to contain empty strings when unused.

2. Modified Records
- `auth.users` for `0000000000@sahab-pos.app` only.
- Normalizes unused text token fields to empty strings.
- Normalizes the optional administrator flag to false when it is NULL.
- Refreshes the password using bcrypt cost factor 10.

3. Security
- The update is restricted to the exact developer email.
- No rows are deleted and no permissions, policies, or public tables are changed.
- The operation is idempotent.

4. Important Notes
- Timestamps that are legitimately unset remain NULL.
- Existing email confirmation, role metadata, and user ID remain unchanged.
*/

UPDATE auth.users
SET encrypted_password = crypt('dev-admin-2026', gen_salt('bf', 10)),
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    phone = COALESCE(phone, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    is_super_admin = COALESCE(is_super_admin, false),
    updated_at = now()
WHERE email = '0000000000@sahab-pos.app';