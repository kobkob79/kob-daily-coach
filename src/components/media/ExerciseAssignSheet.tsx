/**
 * Media Inbox → exercise assignment flow.
 *
 * Bottom action sheet → existing ExercisePicker → confirmation → copy into
 * `exercise-assets/exercises/<id>/<role>.<ext>`. No new schema, no picker
 * duplication. After a successful assignment the admin decides whether the
 * original Inbox file stays or is deleted; nothing is deleted automatically.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Star, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ExercisePicker } from "@/components/workouts/ExercisePicker";
import { supabase } from "@/integrations/supabase/client";
import type { MediaItem } from "@/services/media.service";
import {
  MEDIA_INBOX_BUCKET,
  deleteMediaInboxFile,
} from "@/services/media-inbox.service";
import { assignExerciseMediaServer } from "@/lib/exercise-media-assignment.functions";
import {
  destinationPath,
  EXERCISE_ASSIGN_ROLE_LABEL,
  type ExerciseAssignRole,
} from "@/services/exercise-media-assign.service";

interface Props {
  item: MediaItem | null;
  onClose: () => void;
}

const IMAGE_ACTIONS: { role: ExerciseAssignRole; label: string; icon: typeof Star }[] = [
  { role: "thumbnail", label: "שייך כתמונה ממוזערת", icon: ImageIcon },
  { role: "main", label: "הגדר כתמונה ראשית לתרגיל", icon: Star },
];

type Step = "actions" | "confirm" | "replace" | "post-assign" | "delete";

export function ExerciseAssignSheet({ item, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("actions");
  const [role, setRole] = useState<ExerciseAssignRole | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [replacePath, setReplacePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isVideo = item?.kind === "video";
  const actions = isVideo
    ? [{ role: "demo" as ExerciseAssignRole, label: "שייך כסרטון הדגמה לתרגיל", icon: Video }]
    : IMAGE_ACTIONS;

  function reset() {
    setStep("actions");
    setRole(null);
    setPickerOpen(false);
    setTarget(null);
    setReplacePath(null);
    setBusy(false);
  }

  function closeAll() {
    reset();
    onClose();
  }

  async function refreshGallery() {
    await qc.invalidateQueries({ queryKey: ["exercise-media"] });
    await qc.invalidateQueries({ queryKey: ["media-tree"] });
  }

  async function pickExercise(exerciseId: string) {
    setPickerOpen(false);
    const { data } = await supabase
      .from("exercises")
      .select("id,name")
      .eq("id", exerciseId)
      .maybeSingle();
    setTarget({ id: exerciseId, name: data?.name ?? "תרגיל" });
    setStep("confirm");
  }

 async function confirm(allowReplace = false) {
  if (!item || !role || !target) return;

  setBusy(true);

  try {
    const result = await assignExerciseMediaServer({
      data: {
        sourcePath: item.path,
        exerciseId: target.id,
        role,
        replace: allowReplace,
      },
    });

    if (result.status === "exists") {
      setReplacePath(result.existingPath);
      setStep("replace");
      setBusy(false);
      return;
    }

    await refreshGallery();

    toast.success(
      `המדיה שויכה ל-${target.name} כ${EXERCISE_ASSIGN_ROLE_LABEL[role]}`,
    );

    setBusy(false);
    setStep("post-assign");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "השיוך נכשל",
    );
    setBusy(false);
  }
}

  async function removeFromInbox() {
    if (!item) return;
    setBusy(true);
    try {
      await deleteMediaInboxFile(item.path);
      await qc.invalidateQueries({ queryKey: ["media-tree", MEDIA_INBOX_BUCKET] });
      await qc.invalidateQueries({ queryKey: ["media-tree"] });
      toast.success("הקובץ נמחק מה-Inbox");
      closeAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "המחיקה נכשלה");
      setBusy(false);
    }
  }

  const open = !!item;

  return (
    <>
      <Sheet
        open={open && !pickerOpen}
        onOpenChange={(next) => {
          if (!next) closeAll();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-start">
            <SheetTitle>מה לעשות עם המדיה?</SheetTitle>
            <SheetDescription dir="ltr" className="truncate text-start">
              {item?.name}
            </SheetDescription>
          </SheetHeader>

          {step === "actions" && (
            <div className="mt-4 space-y-2 pb-4">
              {actions.map(({ role: r, label, icon: Icon }) => (
                <Button
                  key={r}
                  variant="outline"
                  className="h-12 w-full justify-start"
                  onClick={() => {
                    setRole(r);
                    setPickerOpen(true);
                  }}
                >
                  <Icon className="ml-2 h-4 w-4" />
                  {label}
                </Button>
              ))}

              <Button
                variant="ghost"
                className="h-12 w-full justify-start text-destructive hover:text-destructive"
                onClick={() => setStep("delete")}
              >
                <Trash2 className="ml-2 h-4 w-4" />
                מחק מה-Inbox
              </Button>
            </div>
          )}

          {step === "confirm" && target && role && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">
                לשייך את המדיה ל-{target.name} כ{EXERCISE_ASSIGN_ROLE_LABEL[role]}?
              </p>
              <p dir="ltr" className="text-[11px] text-muted-foreground">
                {destinationPath(target.id, role, item!.path)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button className="h-12" disabled={busy} onClick={() => void confirm(false)}>
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  אישור
                </Button>
                <Button className="h-12" variant="outline" disabled={busy} onClick={closeAll}>
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {step === "replace" && replacePath && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">כבר קיימת מדיה מסוג זה לתרגיל. להחליף אותה?</p>
              <p dir="ltr" className="text-[11px] text-muted-foreground">
                {replacePath}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="h-12"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void confirm(true)}
                >
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  החלף
                </Button>
                <Button className="h-12" variant="outline" disabled={busy} onClick={closeAll}>
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {step === "post-assign" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">השיוך הושלם. מה לעשות עם הקובץ המקורי ב-Inbox?</p>
              <div className="grid gap-3">
                <Button className="h-12" variant="outline" disabled={busy} onClick={closeAll}>
                  השאר ב-Inbox
                </Button>
                <Button
                  className="h-12"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void removeFromInbox()}
                >
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  מחק מה-Inbox
                </Button>
              </div>
            </div>
          )}

          {step === "delete" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">למחוק את הקובץ מה-Inbox? הפעולה אינה ניתנת לשחזור.</p>
              <p dir="ltr" className="text-[11px] text-muted-foreground">
                {item?.path}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="h-12"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep("actions")}
                >
                  ביטול
                </Button>
                <Button
                  className="h-12"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void removeFromInbox()}
                >
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  מחק
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        title="בחר תרגיל לשיוך"
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => void pickExercise(id)}
      />
    </>
  );
}
