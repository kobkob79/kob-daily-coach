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
  onClose,
  onSaved,
}: {
  weekday: number;
  current: PlanSlot | null;
  templates: { id: string; name: string }[];
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
          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              אין תבניות עדיין —{" "}
              <Link to="/workout-templates" className="text-primary underline">
                צור תבנית
              </Link>
              .
            </p>
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
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => clear.mutate()}
              disabled={busy}
            >
              הסר שיוך
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
