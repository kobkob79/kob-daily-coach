import { type AdvisorConversationDto } from "@/lib/advisor-conversations";
import { ConversationListItem } from "./ConversationListItem";

interface ConversationListProps {
  conversations: AdvisorConversationDto[];
  onSelect: (id: string) => void;
  onRename: (id: string, currentTitle: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations,
  onSelect,
  onRename,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex flex-col gap-2" dir="rtl">
      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          onSelect={() => onSelect(conversation.id)}
          onRename={() => onRename(conversation.id, conversation.title || "שיחה ללא שם")}
          onDelete={() => onDelete(conversation.id)}
        />
      ))}
    </div>
  );
}
