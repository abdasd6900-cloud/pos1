/*
# Revoke EXECUTE on admin SECURITY DEFINER functions from anon

1. Changes
- The following SECURITY DEFINER functions were callable by both `anon`
  and `authenticated` (Postgres grants EXECUTE to PUBLIC by default).
- These are admin-only privileged functions that perform internal
  authorization checks via auth.uid(). They should not be callable by
  the `anon` role.
- Revoking EXECUTE from PUBLIC and anon, then granting to authenticated
  only — the functions already verify the caller is an admin internally.
2. Security
- Narrows EXECUTE on 5 functions from PUBLIC to authenticated only.
- No table, policy, or column changes.
3. Functions affected
- admin_assign_activation_key(uuid, uuid)
- admin_update_profile_role(uuid, text)
- admin_update_profile_status(uuid, boolean)
- claim_sms_inbox_events(integer)
- consume_activation_key(text, uuid)
*/

REVOKE EXECUTE ON FUNCTION public.admin_assign_activation_key(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_activation_key(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_role(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile_status(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_sms_inbox_events(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_sms_inbox_events(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_activation_key(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_activation_key(text, uuid) TO authenticated;
