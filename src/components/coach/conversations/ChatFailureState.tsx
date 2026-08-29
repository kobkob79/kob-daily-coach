import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatFailureStateProps {
  onRetry: () => void;
  message?: string;
}

export function ChatFailureState({
  onRetry,
  message = "לא הצלחנו לטעון את השיחות. אולי יש בעיית חיבור?",
}: ChatFailureStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" dir="rtl">
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-5 text-sm w-full max-w-sm flex flex-col items-center gap-3">
        <p className="text-destructive font-medium">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-2 h-10">
          <RotateCcw className="h-4 w-4 ml-2" aria-hidden />
          נסו שוב
        </Button>
      </div>
    </div>
  );
}
