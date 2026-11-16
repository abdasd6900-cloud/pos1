-- Revoke EXECUTE on trigger functions that should not be callable via API
REVOKE EXECUTE ON FUNCTION public.set_first_user_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_role_to_auth() FROM PUBLIC, anon, authenticated;
