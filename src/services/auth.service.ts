/** Authentication service — the only place auth calls are made. */
import { lovable } from "@/integrations/lovable";
import { supabase, unwrap, ServiceError } from "./base";

export const authService = {
  async signUpWithEmail(email: string, password: string, redirectTo = "/") {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${redirectTo}` },
    });
    if (error) throw new ServiceError(error.message, error);
  },

  async signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ServiceError(error.message, error);
  },

  /**
   * Google sign-in through the managed OAuth broker.
   * `redirect_uri` must stay a public same-origin URL — the intended
   * destination is restored by the caller after the session hydrates.
   */
  async signInWithGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw new ServiceError(result.error.message ?? "Google sign-in failed", result.error);
    return result;
  },

  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new ServiceError(error.message, error);
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new ServiceError(error.message, error);
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new ServiceError(error.message, error);
    return data.user;
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ServiceError(error.message, error);
    return data.session;
  },
};
