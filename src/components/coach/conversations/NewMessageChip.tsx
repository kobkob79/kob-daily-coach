import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewMessageChipProps {
  onClick: () => void;
}

export function NewMessageChip({ onClick }: NewMessageChipProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
      <Button
        onClick={onClick}
        variant="secondary"
        className="rounded-full shadow-lg border border-primary/20 bg-background/95 backdrop-blur font-semibold hover:bg-muted/80 gap-2 h-10 px-5 transition-all"
        dir="rtl"
      >
        <MessageSquarePlus className="h-4 w-4 text-primary" aria-hidden />
        הודעה חדשה למטה
      </Button>
    </div>
  );
}
