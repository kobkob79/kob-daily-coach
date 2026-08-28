import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CreateAdvisorConversationResult,
  DeleteAdvisorConversationResult,
  GetAdvisorConversationMessagesResult,
  ListAdvisorConversationsResult,
  RenameAdvisorConversationResult,
  SendAdvisorMessageResult,
} from "@/lib/advisor-conversations";

const advisorId = z.enum(["adam", "daniel", "maya", "shiran"]);
const uuid = z.string().uuid();
const listSchema = z.object({
  advisorId: advisorId.optional(),
  cursor: z.object({ beforeLastMessageAt: z.string(), beforeId: uuid }).nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
const createSchema = z.object({ advisorId, title: z.string().max(120).optional() });
const messagesSchema = z.object({
  conversationId: uuid,
  cursor: z.object({ beforeOrdinal: z.string() }).nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const renameSchema = z.object({ conversationId: uuid, title: z.string().min(1).max(120) });
const deleteSchema = z.object({ conversationId: uuid });
const sendSchema = z.object({
  conversationId: uuid,
  clientRequestId: uuid,
  message: z.string().min(1).max(4000),
  retryOfMessageId: uuid.optional(),
});

async function serverDependencies() {
  const [{ supabaseAdvisorConversationStore }, { supabaseAdvisorQuotaStore }, admin] =
    await Promise.all([
      import("@/lib/advisor-core/server/conversation-store.server"),
      import("@/lib/advisor-core/server/quota.server"),
      import("@/integrations/supabase/admin-middleware"),
    ]);
  return { supabaseAdvisorConversationStore, supabaseAdvisorQuotaStore, admin };
}

function unavailable() {
  return {
    status: "error" as const,
    error: { code: "PERSISTENCE_UNAVAILABLE" as const, retryable: true },
  };
}

export const listAdvisorConversationsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ListAdvisorConversationsResult> => {
    try {
      const { supabaseAdvisorConversationStore: store } = await serverDependencies();
      return {
        status: "success",
        data: await store.list(String(context.userId), {
          advisorId: data.advisorId,
          cursor: data.cursor,
          limit: data.limit ?? 20,
        }),
      };
    } catch {
      return unavailable();
    }
  });

export const createAdvisorConversationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreateAdvisorConversationResult> => {
    try {
      const { supabaseAdvisorConversationStore: store } = await serverDependencies();
      const { normalizeAdvisorTitle } =
        await import("@/lib/advisor-core/server/conversation-store.server");
      const title = data.title ? normalizeAdvisorTitle(data.title) : null;
      if (data.title && !title)
        return { status: "error", error: { code: "INVALID_REQUEST", retryable: false } };
      return {
        status: "success",
        data: { conversation: await store.create(String(context.userId), data.advisorId, title) },
      };
    } catch {
      return unavailable();
    }
  });

export const getAdvisorConversationMessagesServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => messagesSchema.parse(input))
  .handler(async ({ data, context }): Promise<GetAdvisorConversationMessagesResult> => {
    try {
      const userId = String(context.userId);
      const {
        supabaseAdvisorConversationStore: store,
        supabaseAdvisorQuotaStore,
        admin,
      } = await serverDependencies();
      const conversation = await store.findOwned(userId, data.conversationId);
      if (!conversation) return { status: "error", error: { code: "NOT_FOUND", retryable: false } };
      const isAdmin = await admin.userHasAdminRole(userId);
      const quota = isAdmin
        ? { mode: "unlimited" as const, state: "available" as const, resetsAt: null }
        : await supabaseAdvisorQuotaStore.getStatus(userId).then((value) => ({
            mode: "daily" as const,
            state: value.allowed ? ("available" as const) : ("exhausted" as const),
            resetsAt: value.resets_at,
          }));
      return {
        status: "success",
        data: {
          conversation: {
            id: conversation.id,
            advisorId: conversation.advisor_id,
            title: conversation.title,
            status: conversation.status,
            isCurrent: conversation.is_current,
            lastMessageAt: conversation.last_message_at,
            lastMessageSnippet: null,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
          },
          messages: await store.listMessages(
            userId,
            data.conversationId,
            data.cursor,
            data.limit ?? 50,
          ),
          contextFlags: [],
          quota,
        },
      };
    } catch {
      return unavailable();
    }
  });

export const renameAdvisorConversationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => renameSchema.parse(input))
  .handler(async ({ data, context }): Promise<RenameAdvisorConversationResult> => {
    try {
      const { supabaseAdvisorConversationStore: store } = await serverDependencies();
      const { normalizeAdvisorTitle } =
        await import("@/lib/advisor-core/server/conversation-store.server");
      const title = normalizeAdvisorTitle(data.title);
      if (!title) return { status: "error", error: { code: "INVALID_REQUEST", retryable: false } };
      return {
        status: "success",
        data: {
          conversation: await store.rename(String(context.userId), data.conversationId, title),
        },
      };
    } catch (error) {
      if ((error as { name?: string }).name === "AdvisorConversationNotFoundError") {
        return { status: "error", error: { code: "NOT_FOUND", retryable: false } };
      }
      return unavailable();
    }
  });

export const deleteAdvisorConversationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<DeleteAdvisorConversationResult> => {
    try {
      const { supabaseAdvisorConversationStore: store } = await serverDependencies();
      await store.softDelete(String(context.userId), data.conversationId);
      return { status: "success", data: { conversationId: data.conversationId, deleted: true } };
    } catch (error) {
      if ((error as { name?: string }).name === "AdvisorConversationNotFoundError") {
        return { status: "error", error: { code: "NOT_FOUND", retryable: false } };
      }
      return unavailable();
    }
  });

export const sendAdvisorMessageServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }): Promise<SendAdvisorMessageResult> => {
    const userId = String(context.userId);
    try {
      const { supabaseAdvisorConversationStore, supabaseAdvisorQuotaStore, admin } =
        await serverDependencies();
      const conversation = await supabaseAdvisorConversationStore.findOwned(
        userId,
        data.conversationId,
      );
      if (!conversation) return { status: "error", error: { code: "NOT_FOUND", retryable: false } };
      const { sendPersistentAdvisorMessage } =
        await import("@/lib/advisor-core/server/advisor-conversation-flow.server");
      return sendPersistentAdvisorMessage(userId, conversation.advisor_id, data, {
        conversationStore: supabaseAdvisorConversationStore,
        quotaStore: supabaseAdvisorQuotaStore,
        supabase: context.supabase,
        quotaExempt: await admin.userHasAdminRole(userId),
      });
    } catch {
      return unavailable();
    }
  });
