/**
 * Weekly planner day assignment dialog.
 *
 * Planning-only: writes to `workout_plans` (intent). It NEVER touches
 * `workout_sessions` — completed / active sessions are unaffected.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { setPlanSlot, WEEKDAY_HE, type PlanSlot } from "@/lib/workout-session";

export const REST_DAY_LABEL = "יום מנוחה";

export function AssignDayDialog({
  weekday,
  current,
  templates,
  isLoading = false,
  isError = false,
  onRetry,
  onClose,
  onSaved,
}: {
  weekday: number;
  current: PlanSlot | null;
  templates: { id: string; name: string }[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(current?.template_id ?? "");

  const save = useMutation({
    mutationFn: async () => setPlanSlot(weekday, templateId || null, null),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const rest = useMutation({
    mutationFn: async () => setPlanSlot(weekday, null, REST_DAY_LABEL),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => setPlanSlot(weekday, null, null),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = save.isPending || rest.isPending || clear.isPending;
  const isEmpty = !isLoading && !isError && templates.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>יום {WEEKDAY_HE[weekday]}</DialogTitle>
          <DialogDescription>
            תכנון בלבד — שינוי כאן לא משפיע על אימונים שכבר בוצעו.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading && (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-2/3 rounded-md" />
            </div>
          )}

          {isError && (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <p className="text-sm font-semibold">לא הצלחנו לטעון את תוכניות האימון.</p>
              <Button variant="outline" size="sm" className="h-9" onClick={() => onRetry?.()}>
                <RefreshCw className="ml-1 h-4 w-4" /> נסה שוב
              </Button>
            </div>
          )}

          {isEmpty && (
            <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
              <p className="text-sm font-semibold">אין עדיין תוכניות אימון.</p>
              <Button asChild size="sm" className="h-10 w-full font-bold">
                <Link to="/workout-templates">
                  <Plus className="ml-1 h-4 w-4" /> צור תוכנית חדשה
                </Link>
              </Button>
            </div>
          )}

          {!isLoading && !isError && templates.length > 0 && (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="בחר תבנית אימון" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex flex-col gap-2">
            <Button
              className="h-12 text-base font-bold"
              onClick={() => save.mutate()}
              disabled={busy || !templateId}
            >
              {current?.template_id ? "החלף אימון" : "שייך אימון"}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => rest.mutate()}
              disabled={busy}
            >
              סמן כיום מנוחה
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => clear.mutate()} disabled={busy}>
              הסר שיוך
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
