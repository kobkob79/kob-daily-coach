/**
 * Minimal admin-privilege check.
 *
 * Backed by `public.user_roles` with owner-scoped RLS, so a normal user can
 * only ever read their own rows and cannot grant themselves a role from the
 * client. Role grants happen in the backend only.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchIsAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();

  if (error) return false;
  return !!data;
}
