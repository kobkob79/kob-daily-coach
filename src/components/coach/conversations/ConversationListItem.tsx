import { format } from "date-fns";
import { he } from "date-fns/locale";
import { MessageCircle } from "lucide-react";
import { type AdvisorConversationDto } from "@/lib/advisor-conversations";
import { ConversationOverflowMenu } from "./ConversationOverflowMenu";

interface ConversationListItemProps {
  conversation: AdvisorConversationDto;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ConversationListItem({
  conversation,
  onSelect,
  onRename,
  onDelete,
}: ConversationListItemProps) {
  const displayTitle = conversation.title || "שיחה ללא שם";
  const dateStr = conversation.lastMessageAt || conversation.createdAt;
  const dateDisplay = format(new Date(dateStr), "d בMMM yyyy", { locale: he });

  return (
    <div className="group relative flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-card p-3 shadow-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1 focus-within:ring-offset-background">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-right text-foreground focus:outline-none"
        onClick={onSelect}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-tight">{displayTitle}</h3>
          <p className="truncate text-xs text-muted-foreground mt-0.5">
            {conversation.lastMessageSnippet || "אין הודעות"} • {dateDisplay}
          </p>
        </div>
      </button>

      <ConversationOverflowMenu onRename={onRename} onDelete={onDelete} title={displayTitle} />
    </div>
  );
}
