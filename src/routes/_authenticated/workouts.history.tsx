/**
 * Session history list.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { WorkoutHistoryList } from "@/components/history/WorkoutHistoryList";

export const Route = createFileRoute("/_authenticated/workouts/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">היסטוריית אימונים</h1>
        <div className="w-16" />
      </div>

      <WorkoutHistoryList />
    </div>
  );
}
