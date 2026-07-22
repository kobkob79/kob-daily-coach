import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { getStoredMode, setStoredMode, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "בהיר", Icon: Sun },
  { value: "dark", label: "כהה", Icon: Moon },
  { value: "system", label: "לפי הגדרות המכשיר", Icon: Monitor },
];

export function ThemeSelector() {
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => setMode(getStoredMode()), []);

  const select = (m: ThemeMode) => {
    setMode(m);
    setStoredMode(m);
  };

  return (
    <div dir="rtl" className="rounded-3xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-bold">מראה האפליקציה</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-foreground shadow-glow"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-center leading-tight">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
