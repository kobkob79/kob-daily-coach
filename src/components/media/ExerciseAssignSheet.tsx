/**
 * Media Inbox → exercise assignment flow (Phase 1).
 *
 * Bottom action sheet → existing ExercisePicker → confirmation → copy into
 * `exercise-assets/exercises/<id>/<role>.<ext>`. No new schema, no picker
 * duplication, and the original inbox file is never deleted.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Star, Video } from "lucide-react";
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
  assignInboxMediaToExercise,
  destinationPath,
  EXERCISE_ASSIGN_ROLE_LABEL,
  findExistingRoleMedia,
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

export function ExerciseAssignSheet({ item, onClose }: Props) {
  const qc = useQueryClient();
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

  async function pickExercise(exerciseId: string) {
    setPickerOpen(false);
    const { data } = await supabase
      .from("exercises")
      .select("id,name")
      .eq("id", exerciseId)
      .maybeSingle();
    setTarget({ id: exerciseId, name: data?.name ?? "תרגיל" });
  }

  async function confirm(allowReplace = false) {
    if (!item || !role || !target) return;
    setBusy(true);
    try {
      if (!allowReplace) {
        const existing = await findExistingRoleMedia(target.id, role);
        if (existing) {
          setReplacePath(existing);
          setBusy(false);
          return;
        }
      }

      await assignInboxMediaToExercise({
        inboxPath: item.path,
        exerciseId: target.id,
        role,
        allowReplace: true,
      });

      await qc.invalidateQueries({ queryKey: ["exercise-media"] });
      await qc.invalidateQueries({ queryKey: ["media-tree"] });
      toast.success(
        `המדיה שויכה ל-${target.name} כ${EXERCISE_ASSIGN_ROLE_LABEL[role]}`,
      );
      closeAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "השיוך נכשל");
      setBusy(false);
    }
  }

  const open = !!item;
  const showConfirm = !!target && !!role;

  return (
    <>
      <Sheet
        open={open && !pickerOpen}
        onOpenChange={(next) => {
          if (!next) closeAll();
        }}
      >
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="text-start">
            <SheetTitle>מה לעשות עם המדיה?</SheetTitle>
            <SheetDescription dir="ltr" className="truncate text-start">
              {item?.name}
            </SheetDescription>
          </SheetHeader>

          {!showConfirm && (
            <div className="mt-4 space-y-2 pb-4">
              {actions.map(({ role: r, label, icon: Icon }) => (
                <Button
                  key={r}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setRole(r);
                    setPickerOpen(true);
                  }}
                >
                  <Icon className="ml-2 h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          )}

          {showConfirm && !replacePath && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">
                לשייך את המדיה ל-{target!.name} כ{EXERCISE_ASSIGN_ROLE_LABEL[role!]}?
              </p>
              <p dir="ltr" className="text-[11px] text-muted-foreground">
                {destinationPath(target!.id, role!, item!.path)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button disabled={busy} onClick={() => void confirm(false)}>
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  אישור
                </Button>
                <Button variant="outline" disabled={busy} onClick={closeAll}>
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {showConfirm && replacePath && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm">כבר קיימת מדיה מסוג זה לתרגיל. להחליף אותה?</p>
              <p dir="ltr" className="text-[11px] text-muted-foreground">
                {replacePath}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void confirm(true)}
                >
                  {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  החלף
                </Button>
                <Button variant="outline" disabled={busy} onClick={closeAll}>
                  ביטול
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
