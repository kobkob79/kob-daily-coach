import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, UserRoundX } from "lucide-react";
import { CoachChatShell } from "@/components/coach/CoachChatShell";
import { AdvisorVisual } from "@/components/coach/AdvisorVisual";
import { getCoachAdvisor } from "@/lib/coach-advisors";
import { PremiumGate } from "@/components/premium/PremiumGate";
import { useVioraPlanUI } from "@/lib/plan-ui";

export const Route = createFileRoute("/_authenticated/coach/$advisorId")({
  component: AdvisorChatPage,
});

function AdvisorChatPage() {
  const { advisorId } = Route.useParams();
  const advisor = getCoachAdvisor(advisorId);
  const { hydrated, isPremium, isConnected } = useVioraPlanUI();

  if (!advisor) {
    return (
      <div dir="rtl" className="grid min-h-[50dvh] place-items-center text-center">
        <div>
          <UserRoundX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <h1 className="mt-3 text-lg font-bold">היועץ לא נמצא</h1>
          <Link to="/coach" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary">
            <ArrowRight className="h-4 w-4" aria-hidden /> חזרה לכל היועצים
          </Link>
        </div>
      </div>
    );
  }
  if (!hydrated) {
  return (
    <div dir="rtl" className="grid min-h-[40dvh] place-items-center">
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">
          טוען את חוויית Viora...
        </p>
      </div>
    </div>
  );
}
  if (!(isPremium && isConnected)) {
    return (
      <div dir="rtl" className="space-y-4 pb-6">
        <header className="flex items-center gap-3">
          <Link
            to="/coach"
            aria-label="חזרה ליועצים"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <AdvisorVisual advisor={advisor} variant="avatar" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-extrabold leading-tight">{advisor.name}</h1>
            <p className="truncate text-[12px] font-semibold text-primary">{advisor.field}</p>
          </div>
        </header>

        <AdvisorVisual advisor={advisor} variant="hero" />

        <p className="text-[13px] leading-relaxed text-muted-foreground">{advisor.tagline}</p>

        <PremiumGate
          variant={isPremium ? "connect" : "locked"}
          title={
            isPremium ? `חברו AI כדי לדבר עם ${advisor.name}` : `שיחה עם ${advisor.name} ב־Premium`
          }
          description={
            isPremium
              ? "החיבור נעשה פעם אחת, ואחריו השיחה נפתחת מיד."
              : "Premium פותח שיחה חיה עם היועצים, עם חשבון ה־AI שלך."
          }
        />
      </div>

    );
  }

  return <CoachChatShell key={advisor.id} advisor={advisor} />;
}
