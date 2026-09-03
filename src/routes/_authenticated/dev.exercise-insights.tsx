import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { DevConsoleShell } from "@/components/dev/DevConsoleShell";
import { ExerciseInsightsPanel } from "@/components/workouts/ExerciseInsightsPanel";
import { Button } from "@/components/ui/button";
import {
  addExerciseInsight,
  deleteExerciseInsight,
  editExerciseInsight,
  type ExerciseInsight,
  type ExerciseInsightCategory,
} from "@/lib/exercise-insights";

export const Route = createFileRoute("/_authenticated/dev/exercise-insights")({
  head: () => ({
    meta: [
      { title: "תצוגת התובנות שלי | Viora" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExerciseInsightsPreview,
});

const EXAMPLE_INSIGHTS: ExerciseInsight[] = [
  { id: "example-seat", category: "machine_setup", text: "גובה כיסא: 4" },
  { id: "example-neck", category: "technique", text: "לשמור על צוואר ישר" },
];

function ExerciseInsightsPreview() {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<ExerciseInsight[]>(EXAMPLE_INSIGHTS);

  const add = (input: { category: ExerciseInsightCategory; text: string }) => {
    setInsights((current) =>
      addExerciseInsight(current, {
        ...input,
        id: globalThis.crypto.randomUUID(),
      }),
    );
  };

  return (
    <DevConsoleShell
      title="התובנות שלי"
      subtitle="תצוגה מקדימה של מידע פרטי לכל תרגיל"
      activeModuleId="exercise-insights"
    >
      <div className="mx-auto max-w-md space-y-4 pb-8" dir="rtl">
        <section className="surface-card space-y-3 rounded-3xl border border-border/60 p-4">
          <div>
            <p className="text-xs font-semibold text-primary">תרגיל לדוגמה</p>
            <h1 className="mt-1 text-xl font-bold">לחיצת חזה במכונה</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              הנתונים במסך זה נשמרים בזיכרון המקומי של ה־preview בלבד ונמחקים ברענון.
            </p>
          </div>

          <ExerciseInsightsPanel
            exerciseName="לחיצת חזה במכונה"
            insights={insights}
            open={open}
            onOpenChange={setOpen}
            onAdd={add}
            onEdit={(insight) => setInsights((current) => editExerciseInsight(current, insight))}
            onDelete={(insightId) =>
              setInsights((current) => deleteExerciseInsight(current, insightId))
            }
          />
        </section>

        <section className="rounded-2xl border border-dashed border-border/60 p-4">
          <p className="text-sm font-semibold">מצבי בדיקה</p>
          <p className="mt-1 text-xs text-muted-foreground">
            אפשר לעבור בין מצב מאוכלס למצב ריק לפני פתיחת ה־Bottom Sheet.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setInsights(EXAMPLE_INSIGHTS)}
            >
              מצב מאוכלס
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setInsights([])}
            >
              מצב ריק
            </Button>
          </div>
        </section>
      </div>
    </DevConsoleShell>
  );
}
