import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, UserRoundX } from "lucide-react";
import { CoachChatShell } from "@/components/coach/CoachChatShell";
import { getCoachAdvisor } from "@/lib/coach-advisors";

export const Route = createFileRoute("/_authenticated/coach/$advisorId")({
  component: AdvisorChatPage,
});

function AdvisorChatPage() {
  const { advisorId } = Route.useParams();
  const advisor = getCoachAdvisor(advisorId);

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

  return <CoachChatShell key={advisor.id} advisor={advisor} />;
}
