/**
 * AIConnectionSection — the "connect a service" surface for Viora AI.
 *
 * Deliberately non-technical: no key fields, no masked keys, no developer
 * vocabulary. UI only — connecting/validating/disconnecting updates local
 * presentation state (see src/lib/plan-ui.ts).
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  ChevronLeft,
  Link2,
  Link2Off,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useVioraPlanUI, AI_PROVIDER_LABEL } from "@/lib/plan-ui";
import { PlanBadge } from "./PremiumGate";
import { cn } from "@/lib/utils";

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Compact plan + AI status row for Profile / Settings. */
export function PlanAndAISection({ className }: { className?: string }) {
  const { hydrated, isPremium, isConnected, connection, setPlan } = useVioraPlanUI();
  const [manageOpen, setManageOpen] = useState(false);
  const validatedAt = formatWhen(connection.lastValidatedAt);

  return (
    <section id="ai-connection" className={cn("scroll-mt-24 text-right", className)} dir="rtl">
      <SectionHeader title="התוכנית ו־AI" subtitle="מה פתוח לך ואיך ה־AI מחובר" />

      <PremiumCard className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold">התוכנית הנוכחית</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isPremium ? "כל יכולות Viora AI פתוחות" : "החוויה המלאה של Viora, בלי AI"}
            </p>
          </div>
          <PlanBadge premium={isPremium} />
        </div>

        <div className="h-px bg-border/60" />

        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-1 text-right transition active:scale-[0.99]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                isPremium && isConnected
                  ? "bg-success/15 text-success"
                  : "bg-muted/50 text-muted-foreground",
              )}
            >
              {isPremium ? (
                isConnected ? (
                  <BadgeCheck className="h-5 w-5" aria-hidden />
                ) : (
                  <Link2 className="h-5 w-5" aria-hidden />
                )
              ) : (
                <Lock className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold">חיבור AI · {AI_PROVIDER_LABEL}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {!hydrated
                  ? "טוען מצב…"
                  : !isPremium
                    ? "זמין ב־Premium"
                    : isConnected
                      ? validatedAt
                        ? `מחובר · נבדק ${validatedAt}`
                        : "מחובר"
                      : "לא מחובר"}
              </p>
            </div>
          </div>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {/* Preview control — lets you review every state of this design. */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/25 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">תצוגת מצב (עיצוב)</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPlan("free")}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-bold transition",
                !isPremium ? "bg-foreground/10 text-foreground" : "text-muted-foreground",
              )}
            >
              Free
            </button>
            <button
              type="button"
              onClick={() => setPlan("premium")}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-bold transition",
                isPremium ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              Premium
            </button>
          </div>
        </div>
      </PremiumCard>

      <ManageAISheet open={manageOpen} onOpenChange={setManageOpen} />
    </section>
  );
}

/** Bottom sheet that owns connect / validate / disconnect. */
export function ManageAISheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { isPremium, isConnected, connection, connect, validate, disconnect, setPlan } =
    useVioraPlanUI();
  const validatedAt = formatWhen(connection.lastValidatedAt);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-0 bg-transparent p-0 shadow-none">
        <div dir="rtl" className="mx-auto w-full max-w-2xl px-3 pb-[env(safe-area-inset-bottom)]">
          <div className="relative overflow-hidden rounded-t-[32px] border border-border/60 bg-card/95 p-5 text-right backdrop-blur-2xl">
            <div
              className="pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
              aria-hidden
            />
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/15" />

            <div className="relative flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-extrabold leading-tight">חיבור AI</h2>
                <p className="text-[11px] text-muted-foreground">
                  {AI_PROVIDER_LABEL} · חשבון ה־AI שלך
                </p>
              </div>
            </div>

            {!isPremium ? (
              <div className="relative mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  חיבור AI פתוח למשתמשי Premium. שאר Viora — אימונים, תזונה, שתייה, יומן והתמונה
                  היומית — ממשיך לעבוד במלואו גם בלי AI.
                </p>
                <Button
                  className="min-h-12 w-full rounded-2xl font-bold"
                  onClick={() => {
                    setPlan("premium");
                    toast.success("Premium פעיל — אפשר לחבר AI");
                  }}
                >
                  שדרוג ל־Premium
                </Button>
              </div>
            ) : !isConnected ? (
              <div className="relative mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/25 p-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{AI_PROVIDER_LABEL}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">לא מחובר</p>
                  </div>
                  <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                    ספק AI
                  </span>
                </div>

                <ul className="space-y-2">
                  <PrivacyRow
                    icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
                    text="החיבור נשאר פרטי. Viora לא מציגה ולא שומרת אצלה את פרטי החשבון שלך."
                  />
                  <PrivacyRow
                    icon={<Sparkles className="h-4 w-4" aria-hidden />}
                    text="השימוש ב־AI מחויב ישירות בחשבון הספק שלך — Viora לא מחייבת על שימוש ב־AI."
                  />
                </ul>

                <Button
                  className="min-h-12 w-full rounded-2xl font-bold"
                  onClick={() => {
                    connect();
                    toast.success("AI חובר בהצלחה");
                  }}
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                  חיבור {AI_PROVIDER_LABEL}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  אפשר לנתק בכל רגע, בלחיצה אחת.
                </p>
              </div>
            ) : (
              <div className="relative mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-success/25 bg-success/10 p-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{AI_PROVIDER_LABEL}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {validatedAt ? `נבדק לאחרונה · ${validatedAt}` : "מחובר"}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2.5 py-1 text-[10px] font-bold text-success">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                    מחובר
                  </span>
                </div>

                <PrivacyRow
                  icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
                  text="השימוש ב־AI מחויב בחשבון הספק שלך. Viora לא מציגה את פרטי החשבון."
                />

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="min-h-12 flex-1 rounded-2xl font-bold"
                    onClick={() => {
                      validate();
                      toast.success("החיבור תקין");
                    }}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    בדיקת חיבור
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-12 flex-1 rounded-2xl font-bold text-destructive"
                    onClick={() => {
                      disconnect();
                      toast("החיבור נותק");
                    }}
                  >
                    <Link2Off className="h-4 w-4" aria-hidden />
                    ניתוק
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PrivacyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      {text}
    </li>
  );
}
