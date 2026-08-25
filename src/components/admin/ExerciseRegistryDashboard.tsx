import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDashed,
  ListChecks,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { PremiumCard, EmptyState, SectionHeader } from "@/components/ui-kit/Section";
import {
  filterExerciseRegistryRecords,
  type ExerciseRegistryFilter,
} from "@/lib/exercise-registry-dashboard";
import type { ExerciseRegistryReadModel } from "@/lib/exercise-registry-read-model";
import { getExerciseRegistryStatus, type ExerciseRegistryRecord } from "@/lib/exercise-registry";
import { cn } from "@/lib/utils";

interface ExerciseRegistryDashboardProps {
  model: ExerciseRegistryReadModel;
}

const FILTERS: readonly { value: ExerciseRegistryFilter; label: string }[] = [
  { value: "ALL", label: "הכול" },
  { value: "COMPLETE", label: "הושלם" },
  { value: "PARTIAL", label: "חלקי" },
  { value: "NOT_STARTED", label: "לא התחיל" },
];

const STATUS_LABELS = {
  COMPLETE: "הושלם",
  PARTIAL: "חלקי",
  NOT_STARTED: "לא התחיל",
} as const;

function SummaryItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 px-3 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function MediaIndicator({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium",
        present
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border/50 bg-muted/30 text-muted-foreground",
      )}
    >
      {present ? <Check className="h-3 w-3 text-primary" /> : <CircleDashed className="h-3 w-3" />}
      {label}
    </span>
  );
}

function ExerciseRow({ record }: { record: ExerciseRegistryRecord }) {
  const status = getExerciseRegistryStatus(record);

  return (
    <article className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {record.exerciseNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug">{record.canonicalHebrewName}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                {record.englishName}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[10px]",
                status === "COMPLETE" && "border-primary/40 bg-primary/10",
                status === "PARTIAL" && "border-amber-500/40 bg-amber-500/10",
              )}
            >
              {STATUS_LABELS[status]}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{record.muscleGroup}</span>
            <span className="break-all font-mono" dir="ltr">
              {record.exerciseId}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MediaIndicator label="Cover" present={record.media.hasCover} />
        <MediaIndicator label="Infographic" present={record.media.hasInfographic} />
        <MediaIndicator label="Thumbnail" present={record.media.hasThumbnail} />
        <MediaIndicator label="Demo" present={record.media.hasDemo} />
      </div>
    </article>
  );
}

function Diagnostics({ model }: { model: ExerciseRegistryReadModel }) {
  const { diagnostics } = model;
  const issueCount =
    diagnostics.unresolvedCoreExercises.length +
    diagnostics.unassignedMediaPaths.length +
    diagnostics.unexpectedMediaFolders.length +
    diagnostics.ignoredDatabaseRows;

  return (
    <Collapsible>
      <PremiumCard className="p-0">
        <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-start">
          {issueCount === 0 ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">אבחון Registry</span>
            <span className="block text-[11px] text-muted-foreground">
              {issueCount === 0 ? "הכול תקין — לא נמצאו חריגות" : `${issueCount} ממצאים לבדיקה`}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/50 px-4 py-4">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Core לא פתורים</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {diagnostics.unresolvedCoreExercises.length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">שורות DB שהתעלמנו מהן</dt>
              <dd className="mt-1 font-semibold tabular-nums">{diagnostics.ignoredDatabaseRows}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">נתיבי מדיה לא משויכים</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {diagnostics.unassignedMediaPaths.length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">תיקיות מדיה לא צפויות</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {diagnostics.unexpectedMediaFolders.length}
              </dd>
            </div>
          </dl>
          {diagnostics.unresolvedCoreExercises.length > 0 && (
            <div className="mt-4 rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground">
              {diagnostics.unresolvedCoreExercises.map((exercise) => (
                <p key={exercise.exerciseNumber}>
                  #{exercise.exerciseNumber} {exercise.canonicalHebrewName}
                </p>
              ))}
            </div>
          )}
          {diagnostics.unassignedMediaPaths.length > 0 && (
            <div
              className="mt-3 rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground"
              dir="ltr"
            >
              <p className="mb-1 font-semibold text-foreground">Unassigned media</p>
              {diagnostics.unassignedMediaPaths.map((path) => (
                <p key={path} className="break-all">
                  {path}
                </p>
              ))}
            </div>
          )}
          {diagnostics.unexpectedMediaFolders.length > 0 && (
            <div
              className="mt-3 rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground"
              dir="ltr"
            >
              <p className="mb-1 font-semibold text-foreground">Unexpected folders</p>
              {diagnostics.unexpectedMediaFolders.map((folder) => (
                <p key={folder} className="break-all">
                  {folder}
                </p>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </PremiumCard>
    </Collapsible>
  );
}

export function ExerciseRegistryDashboard({ model }: ExerciseRegistryDashboardProps) {
  const [filter, setFilter] = useState<ExerciseRegistryFilter>("ALL");
  const records = useMemo(
    () => filterExerciseRegistryRecords(model.records, filter),
    [filter, model.records],
  );
  const dashboard = model.dashboard;
  const next = dashboard.nextRecommendedExercise;

  return (
    <div className="space-y-5">
      <PremiumCard className="overflow-hidden border-primary/20 bg-gradient-to-br from-card/90 to-primary/5">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <p className="text-xs font-semibold">התקדמות Core 150</p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {dashboard.overallProgressPercent.toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboard.completedExercises} מתוך {dashboard.totalExercises} הושלמו
            </p>
          </div>
          <ListChecks className="h-8 w-8 text-primary/60" />
        </div>
        <Progress value={dashboard.overallProgressPercent} className="mt-4" />
      </PremiumCard>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryItem label="סה״כ" value={dashboard.totalExercises} />
        <SummaryItem label="הושלמו" value={dashboard.completedExercises} />
        <SummaryItem label="חלקיים" value={dashboard.partialExercises} />
        <SummaryItem label="לא התחילו" value={dashboard.notStartedExercises} />
        <SummaryItem label="Covers" value={dashboard.coversComplete} />
        <SummaryItem label="Infographics" value={dashboard.infographicsComplete} />
        <SummaryItem label="Thumbnails" value={dashboard.thumbnailsComplete} />
        <SummaryItem label="Demos" value={dashboard.demosComplete} />
      </div>

      <PremiumCard className="border-primary/25 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <ScanSearch className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-primary">התרגיל הבא המומלץ</p>
            {next ? (
              <>
                <p className="truncate text-sm font-semibold">
                  #{next.exerciseNumber} · {next.canonicalHebrewName}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {next.englishName}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold">כל התרגילים הושלמו</p>
            )}
          </div>
        </div>
      </PremiumCard>

      <Diagnostics model={model} />

      <section>
        <SectionHeader title="תרגילים" subtitle={`${records.length} תוצאות`} />
        <div
          className="mb-3 grid grid-cols-4 gap-1 rounded-2xl border border-border/50 bg-muted/20 p-1"
          role="group"
          aria-label="סינון סטטוס"
        >
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={cn(
                "min-h-11 rounded-xl px-1 text-[10px] font-medium transition active:scale-95 sm:text-xs",
                filter === option.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {records.length === 0 ? (
          <PremiumCard>
            <EmptyState
              icon={<CircleDashed className="h-5 w-5" />}
              title="אין תרגילים בסינון הזה"
            />
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <ExerciseRow key={record.exerciseId} record={record} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
