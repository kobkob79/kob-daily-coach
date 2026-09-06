/**
 * Direct messages — conversation list. There's no user directory yet, so a
 * new conversation starts from the "הודעה" button on a community post's
 * author (see community.tsx); this list only shows conversations that
 * already have at least one message.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { communityAuthorInitials } from "@/lib/community-posts";
import { buildConversationList, type DirectMessageRow } from "@/lib/direct-messages";

// The generated Database types do not yet include `direct_messages`
// (provisioned by migration 20260906240000_direct_messages.sql), so these
// queries go through a loosely typed handle until the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const CONVERSATION_LIST_LIMIT = 300;

export const Route = createFileRoute("/_authenticated/messages/")({
  component: MessagesIndexPage,
});

function MessagesIndexPage() {
  const userQ = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const messagesQ = useQuery({
    queryKey: ["direct-messages", "conversation-list", userQ.data],
    queryFn: async () => {
      const { data, error } = await db
        .from("direct_messages")
        .select(
          "id,sender_id,sender_display_name,recipient_id,recipient_display_name,body,created_at",
        )
        .or(`sender_id.eq.${userQ.data},recipient_id.eq.${userQ.data}`)
        .order("created_at", { ascending: false })
        .limit(CONVERSATION_LIST_LIMIT);
      if (error) throw error;
      return (data ?? []) as DirectMessageRow[];
    },
    enabled: Boolean(userQ.data),
  });

  const conversations = userQ.data ? buildConversationList(messagesQ.data ?? [], userQ.data) : [];

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הודעות</h1>
        <p className="text-xs text-muted-foreground">שיחות פרטיות 1 על 1</p>
      </div>

      <section>
        <SectionHeader title="שיחות" />
        {messagesQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">טוען...</p>
        ) : conversations.length === 0 ? (
          <PremiumCard className="p-0">
            <EmptyState
              icon={<MessageCircle className="h-5 w-5" />}
              title="עוד אין שיחות"
              hint="שלחו הודעה למישהו מהפיד של הקהילה כדי להתחיל שיחה."
            />
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <Link key={c.otherUserId} to="/messages/$userId" params={{ userId: c.otherUserId }}>
                <PremiumCard className="flex items-center gap-3 py-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-xs font-semibold">
                      {communityAuthorInitials(c.otherDisplayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.otherDisplayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessageMine ? "את/ה: " : ""}
                      {c.lastMessageBody}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.lastMessageAt), {
                      locale: he,
                      addSuffix: true,
                    })}
                  </p>
                </PremiumCard>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
