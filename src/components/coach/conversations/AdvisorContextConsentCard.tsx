import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAdvisorContextConsentServer,
  setAdvisorContextConsentServer,
} from "@/lib/advisor-context-consent.functions";

interface AdvisorContextConsentCardProps {
  onChanged(enabled: boolean): void | Promise<void>;
}

export function AdvisorContextConsentCard({ onChanged }: AdvisorContextConsentCardProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdvisorContextConsentServer().then((result) => {
      if (!active) return;
      setEnabled(result.status === "success" ? result.data.enabled : false);
      if (result.status === "error") setError("לא הצלחנו לטעון את העדפת השיתוף כרגע.");
    });
    return () => {
      active = false;
    };
  }, []);

  const update = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const result = await setAdvisorContextConsentServer({ data: { enabled: next } });
      if (result.status !== "success") {
        setError("לא הצלחנו לעדכן את העדפת השיתוף כרגע.");
        return;
      }
      setEnabled(result.data.enabled);
      await onChanged(result.data.enabled);
    } catch {
      setError("לא הצלחנו לעדכן את העדפת השיתוף כרגע.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 text-sm" dir="rtl">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">שיתוף הקשר אישי עם היועצים</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            באפשרותך לשתף מטרות, מגמות תזונה ואימון, מגבלות, סיכום רפואי מובנה ומגמות מדידה מאושרות.
            מסמכים רפואיים, בדיקות מעבדה, הערות חופשיות, תמונות וקישורי אחסון לעולם אינם משותפים.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            השיתוף אינו מסומן מראש וניתן לבטל אותו בכל עת. היועצים מספקים הכוונה ואינם מחליפים אנשי
            מקצוע רפואיים.
          </p>
          {enabled !== null && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium">{enabled ? "השיתוף פעיל" : "השיתוף כבוי"}</span>
              <Button
                type="button"
                size="sm"
                variant={enabled ? "outline" : "default"}
                disabled={saving}
                onClick={() => void update(!enabled)}
              >
                {saving ? "שומר…" : enabled ? "ביטול שיתוף" : "אישור שיתוף"}
              </Button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}
