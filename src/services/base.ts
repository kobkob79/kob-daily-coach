/**
 * Shared service helpers.
 *
 * All services run through the browser Supabase client and rely on RLS:
 * every table is scoped to `auth.uid()`, so services never need to trust
 * client-supplied user ids for reads.
 */
import { supabase } from "@/integrations/supabase/client";

export { supabase };

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Unwraps a Supabase result, throwing a normalized error on failure. */
export function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) throw new ServiceError(result.error.message, result.error);
  if (result.data === null) throw new ServiceError("No data returned");
  return result.data;
}

/** Returns the current user id, or throws when not signed in. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ServiceError("Not authenticated", error);
  return data.user.id;
}
