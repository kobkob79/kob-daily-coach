import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, Database, Loader2, RefreshCw } from "lucide-react";

import { ExerciseRegistryDashboard } from "@/components/admin/ExerciseRegistryDashboard";
import { PremiumCard, EmptyState } from "@/components/ui-kit/Section";
import { getExerciseRegistryViewState } from "@/lib/exercise-registry-dashboard";
import { getLiveExerciseRegistry } from "@/services";

export const Route = createFileRoute("/_authenticated/admin/exercise-registry")({
  head: () => ({
    meta: [
      { title: "Exercise Registry | Viora Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExerciseRegistryPage,
});

function ExerciseRegistryPage() {
  const registryQ = useQuery({
    queryKey: ["admin", "exercise-registry"],
    queryFn: getLiveExerciseRegistry,
    staleTime: 30_000,
  });
  const viewState = getExerciseRegistryViewState({
    isPending: registryQ.isPending,
    isError: registryQ.isError,
    recordCount: registryQ.data?.records.length,
  });

  return (
    <div className="space-y-5 pb-[env(safe-area-inset-bottom)]" dir="rtl">
      <header className="flex items-center gap-3">
        <Link
          to="/admin"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה ל־Admin"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Exercise Registry</h1>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">תמונת מצב חיה · קריאה בלבד</p>
        </div>
      </header>

      {viewState === "LOADING" && (
        <PremiumCard className="grid min-h-48 place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">טוען את ה־Registry…</p>
            <p className="mt-1 text-xs text-muted-foreground">קורא תרגילים ומדיה</p>
          </div>
        </PremiumCard>
      )}

      {viewState === "ERROR" && (
        <PremiumCard className="border-amber-500/30">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
            title="לא הצלחנו לטעון את ה־Registry"
            hint="לא מוצגים נתוני אפס, משום שמצב המקור אינו ידוע."
            action={
              <button
                type="button"
                onClick={() => void registryQ.refetch()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-xs font-semibold transition hover:bg-muted/50 active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                ניסיון נוסף
              </button>
            }
          />
        </PremiumCard>
      )}

      {viewState === "EMPTY" && (
        <PremiumCard>
          <EmptyState
            icon={<Database className="h-5 w-5" />}
            title="ה־Registry ריק"
            hint="הקריאה הצליחה, אך לא נמצאו תרגילי Core פתורים."
          />
        </PremiumCard>
      )}

      {viewState === "READY" && registryQ.data && (
        <ExerciseRegistryDashboard model={registryQ.data} />
      )}
    </div>
  );
}
