/**
 * Direct messages — one 1:1 thread. Reads/writes go straight through the
 * Supabase client with RLS (same shape as community.tsx) - no server
 * function needed since every rule here (participants-only read, own-row
 * write/delete) is expressible as a plain RLS policy.
 *
 * The `name` search param carries the other side's display name for a
 * brand-new conversation (linked in from their community post, before any
 * message exists to snapshot it from) - once there's at least one message,
 * the name shown always comes from the messages themselves instead.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { communityAuthorInitials } from "@/lib/community-posts";
import {
  DIRECT_MESSAGE_MAX_BODY_LENGTH,
  otherParty,
  validateMessageDraft,
  type DirectMessageRow,
} from "@/lib/direct-messages";
import { cn } from "@/lib/utils";

// The generated Database types do not yet include `direct_messages`
// (provisioned by migration 20260906240000_direct_messages.sql), so these
// queries go through a loosely typed handle until the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const THREAD_LIMIT = 200;

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  validateSearch: (search: Record<string, unknown>): { name?: string } => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  component: DirectMessageThreadPage,
});

function DirectMessageThreadPage() {
  const { userId: otherUserId } = Route.useParams();
  const { name: fallbackName } = Route.useSearch();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const userQ = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const profileQ = useQuery({
    queryKey: ["profile", "dm-sender"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name").maybeSingle();
      return data?.display_name ?? null;
    },
  });

  const messagesQ = useQuery({
    queryKey: ["direct-messages", "thread", userQ.data, otherUserId],
    queryFn: async () => {
      const me = userQ.data;
      const { data, error } = await db
        .from("direct_messages")
        .select(
          "id,sender_id,sender_display_name,recipient_id,recipient_display_name,body,created_at",
        )
        .or(
          `and(sender_id.eq.${me},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${me})`,
        )
        .order("created_at", { ascending: true })
        .limit(THREAD_LIMIT);
      if (error) throw error;
      return (data ?? []) as DirectMessageRow[];
    },
    enabled: Boolean(userQ.data),
    refetchInterval: 4000,
  });

  const messages = messagesQ.data ?? [];
  const lastMessage = messages[messages.length - 1];
  const otherDisplayName = userQ.data
    ? lastMessage
      ? otherParty(lastMessage, userQ.data).displayName
      : (fallbackName ?? "משתמש")
    : (fallbackName ?? "משתמש");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      const validation = validateMessageDraft(body);
      if (!validation.ok) throw new Error(validation.error);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("יש להתחבר מחדש");

      const { error } = await db.from("direct_messages").insert({
        sender_id: u.user.id,
        sender_display_name: profileQ.data?.trim() || "משתמש",
        recipient_id: otherUserId,
        recipient_display_name: otherDisplayName,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["direct-messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div dir="rtl" className="flex min-h-[70dvh] flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Link
          to="/messages"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה לשיחות"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </Link>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="text-xs font-semibold">
            {communityAuthorInitials(otherDisplayName)}
          </AvatarFallback>
        </Avatar>
        <h1 className="truncate text-lg font-bold">{otherDisplayName}</h1>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messagesQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">טוען...</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            עוד אין הודעות. כתבו משהו כדי להתחיל שיחה.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === userQ.data;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <p>{m.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px] opacity-70",
                      mine ? "text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatDistanceToNow(new Date(m.created_at), { locale: he, addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border/60 pt-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="כתבו הודעה..."
          className="min-h-[44px] flex-1 resize-none text-right"
          maxLength={DIRECT_MESSAGE_MAX_BODY_LENGTH}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim() && !sendMessage.isPending) sendMessage.mutate();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          disabled={sendMessage.isPending || !body.trim()}
          onClick={() => sendMessage.mutate()}
          aria-label="שלח הודעה"
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
