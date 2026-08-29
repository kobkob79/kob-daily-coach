import { type FormEvent, useState } from "react";
import { Send, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  isQuotaExhausted?: boolean;
  quotaState?: "loading" | "available" | "unlimited" | "exhausted" | "error";
}

export function ChatComposer({
  onSend,
  disabled,
  isLoading,
  placeholder,
  isQuotaExhausted,
  quotaState = "available",
}: ChatComposerProps) {
  const [input, setInput] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = input.trim();
    if (!clean || disabled || isLoading) return;
    onSend(clean);
    setInput("");
  };

  const currentPlaceholder =
    quotaState === "loading"
      ? "בודקים זמינות…"
      : isQuotaExhausted
        ? "השאלה היומית נוצלה להיום"
        : quotaState === "error"
          ? "לא ניתן לשלוח עד לבדיקת הזמינות"
          : placeholder || "הקלד הודעה…";

  const isInputDisabled = disabled || isLoading || isQuotaExhausted || quotaState === "error";

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-0 flex gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl"
      dir="rtl"
    >
      <Input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={currentPlaceholder}
        className="h-12"
        autoComplete="off"
        disabled={isInputDisabled}
      />
      <Button
        type="submit"
        size="icon"
        className="h-12 w-12 shrink-0"
        disabled={isInputDisabled || !input.trim()}
      >
        {isLoading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        )}
        <span className="sr-only">שליחה</span>
      </Button>
    </form>
  );
}
