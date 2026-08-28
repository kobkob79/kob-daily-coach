import { MessageSquareOff } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
      dir="rtl"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <MessageSquareOff className="h-8 w-8 opacity-50" aria-hidden />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">אין שיחות עדיין</h3>
      <p className="text-sm">התחילו שיחה חדשה כדי להתייעץ עם המומחים שלנו.</p>
    </div>
  );
}
