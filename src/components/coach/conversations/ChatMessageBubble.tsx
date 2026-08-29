import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdvisorMessageContent } from "../AdvisorMessageContent";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { type AdvisorMessageDto } from "@/lib/advisor-conversations";
import { type CoachAdvisor } from "@/lib/coach-advisors";

interface ChatMessageBubbleProps {
  message: AdvisorMessageDto;
  advisor: CoachAdvisor;
  userAvatarUrl?: string | null;
  userName?: string | null;
  onRetry?: (messageId: string, text: string) => void;
}

export function ChatMessageBubble({
  message,
  advisor,
  userAvatarUrl,
  userName,
  onRetry,
}: ChatMessageBubbleProps) {
  const isAdvisor = message.role === "assistant";
  const userInitial = userName?.trim().charAt(0) || "";
  const isFailed =
    message.status === "provider_failed" ||
    message.status === "finalize_failed" ||
    message.status === "interrupted";

  return (
    <div
      dir={isAdvisor ? "rtl" : "ltr"}
      className={
        isAdvisor
          ? "flex w-full max-w-[96%] items-end gap-2 overflow-visible"
          : "mr-auto flex w-full max-w-[94%] items-end gap-2 overflow-visible"
      }
    >
      <Avatar className="z-10 h-9 w-9 shrink-0 self-end border border-primary/20 bg-card shadow-sm ring-2 ring-background">
        {isAdvisor ? (
          <>
            <AvatarImage
              src={advisor.media.cover}
              alt={advisor.name}
              className="object-cover"
              style={{ objectPosition: advisor.media.coverPosition }}
            />
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {advisor.initials}
            </AvatarFallback>
          </>
        ) : (
          <>
            {userAvatarUrl && (
              <AvatarImage src={userAvatarUrl} alt="תמונת הפרופיל שלך" className="object-cover" />
            )}
            <AvatarFallback className="bg-muted text-xs font-bold text-muted-foreground">
              {userInitial || <UserRound className="h-4 w-4" aria-hidden />}
            </AvatarFallback>
          </>
        )}
      </Avatar>

      <div className="flex flex-col gap-1 w-full min-w-0" dir="rtl">
        <div
          className={
            isAdvisor
              ? "min-w-0 rounded-3xl rounded-tr-md border border-border/60 bg-card/70 px-4 py-3"
              : isFailed
                ? "min-w-0 whitespace-pre-wrap break-words rounded-3xl rounded-tl-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-right text-sm leading-6"
                : "min-w-0 whitespace-pre-wrap break-words rounded-3xl rounded-tl-md border border-primary/25 bg-primary/10 px-4 py-3 text-right text-sm leading-6"
          }
        >
          {isAdvisor ? <AdvisorMessageContent text={message.content} /> : message.content}
        </div>

        {isFailed && !isAdvisor && onRetry && (
          <div className="max-w-full rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs self-start mt-1">
            <p>לא הצלחנו לקבל תשובה כרגע.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1.5 min-h-11 px-2 text-xs h-8"
              onClick={() => onRetry(message.id, message.content)}
            >
              <RotateCcw className="h-3.5 w-3.5 ml-1.5" aria-hidden />
              ניסיון נוסף
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
