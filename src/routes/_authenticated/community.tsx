/**
 * Community ("הקהילה") — placeholder for Viora's planned public feed
 * (posts, photos, shared workouts and meals, under a username). The real
 * feature is still being designed; this reserves its place in the bottom
 * nav so the surface exists from day one.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PremiumCard } from "@/components/ui-kit/Section";

export const Route = createFileRoute("/_authenticated/community")({
  component: CommunityPage,
});

function CommunityPage() {
  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">הקהילה</h1>
        <p className="text-sm text-muted-foreground">
          פיד ציבורי לשיתוף אימונים, ארוחות ורגעים — בקרוב.
        </p>
      </div>

      <PremiumCard className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Users className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <p className="text-sm font-semibold">הקהילה בדרך</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          כאן יופיע בקרוב פיד ציבורי שבו כל משתמש יוכל לשתף פוסטים, תמונות, אימונים וארוחות תחת שם
          המשתמש שלו.
        </p>
      </PremiumCard>
    </div>
  );
}
