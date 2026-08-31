import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCOUNT_DELETION_CHALLENGE, type DeleteMyAccountResult } from "./account-deletion";
import { deleteAuthenticatedAccount } from "./account-deletion.server";

const deleteRequestSchema = z
  .object({ requestId: z.uuid(), challenge: z.string().max(16) })
  .strict();

interface DeletionRequestRow {
  request_id: string;
  status: "pending" | "storage_failed" | "auth_failed";
}

interface DeletionRequestQuery {
  select(columns: string): DeletionRequestQuery;
  eq(column: string, value: string): DeletionRequestQuery;
  maybeSingle(): Promise<{ data: DeletionRequestRow | null; error: unknown }>;
  insert(value: Record<string, unknown>): Promise<{ error: unknown }>;
  update(value: Record<string, unknown>): DeletionRequestQuery;
  then<TResult1 = { error: unknown }>(
    onfulfilled?: ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
  ): Promise<TResult1>;
}

interface AccountDeletionAdminClient {
  from(table: "account_deletion_requests"): DeletionRequestQuery;
  storage: {
    from(bucket: string): {
      list(
        path: string,
        options: { limit: number; offset: number },
      ): Promise<{
        data: Array<{ name: string; id?: string | null; metadata?: unknown | null }> | null;
        error: unknown;
      }>;
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
  auth: {
    admin: {
      deleteUser(userId: string, shouldSoftDelete: boolean): Promise<{ error: unknown }>;
    };
  };
}

export const deleteMyAccountServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteRequestSchema.safeParse(input))
  .handler(async ({ data, context }): Promise<DeleteMyAccountResult> => {
    if (!data.success) {
      return { status: "error", error: { code: "INVALID_REQUEST", retryable: false } };
    }
    if (data.data.challenge.trim() !== ACCOUNT_DELETION_CHALLENGE) {
      return { status: "error", error: { code: "INVALID_CHALLENGE", retryable: false } };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AccountDeletionAdminClient;
    const userId = String(context.userId);

    return deleteAuthenticatedAccount(
      { requestId: data.data.requestId, userId },
      {
        claimRequest: async ({ requestId, userId: authenticatedUserId }) => {
          const existing = await admin
            .from("account_deletion_requests")
            .select("request_id,status")
            .eq("user_id", authenticatedUserId)
            .maybeSingle();
          if (existing.error) throw new Error("ACCOUNT_DELETION_CLAIM_FAILED");
          if (existing.data) {
            if (existing.data.status === "pending") {
              return "in_progress";
            }
            const resumed = await admin
              .from("account_deletion_requests")
              .update({
                request_id: requestId,
                status: "pending",
                safe_error_code: null,
                updated_at: new Date().toISOString(),
              })
              .eq("request_id", existing.data.request_id)
              .eq("user_id", authenticatedUserId);
            if (resumed.error) throw new Error("ACCOUNT_DELETION_CLAIM_FAILED");
            return "resume";
          }
          const claimed = await admin.from("account_deletion_requests").insert({
            request_id: requestId,
            user_id: authenticatedUserId,
            status: "pending",
          });
          if (claimed.error) return "in_progress";
          return "claimed";
        },
        markFailure: async (requestId, status, code) => {
          await admin
            .from("account_deletion_requests")
            .update({ status, safe_error_code: code, updated_at: new Date().toISOString() })
            .eq("request_id", requestId);
        },
        list: async (bucket, path, options) => admin.storage.from(bucket).list(path, options),
        remove: async (bucket, paths) => admin.storage.from(bucket).remove(paths),
        deleteAuthUser: async (authenticatedUserId) =>
          admin.auth.admin.deleteUser(authenticatedUserId, false),
        log: (event) => console.error(JSON.stringify({ event })),
      },
    );
  });
