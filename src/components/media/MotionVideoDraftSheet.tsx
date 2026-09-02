/**
 * Motion Video Draft upload flow.
 *
 * The smallest addition to the existing Exercise Media assignment flow
 * that lets an Admin pick an exercise, attach one local MP4, preview it
 * locally, and upload it as a Draft through the trusted server
 * (exercise-motion-draft.functions.ts). Reuses the existing ExercisePicker
 * and the existing Media Inbox upload/staging pipeline
 * (uploadMediaInboxFile) exactly as exercise-media-assignment.functions.ts
 * already does for the legacy roles - no new client-to-Storage path is
 * introduced.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";
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
import { uploadMediaInboxFile } from "@/services/media-inbox.service";
import {
  MOTION_DRAFT_MESSAGES_HE,
  MOTION_VIDEO_MIME_TYPE,
  validateDetectedMotionVideoMetadata,
  type DetectedMotionVideoMetadata,
  type MotionDraftValidationError,
} from "@/lib/exercise-media-v2";
import {
  getExerciseMotionDraftStatusServer,
  uploadExerciseMotionDraftServer,
} from "@/lib/exercise-motion-draft.functions";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "pick-exercise" | "pick-file" | "conflict" | "confirm-replace" | "blocked" | "done";

interface DetectedFile {
  file: File;
  objectUrl: string;
  metadata: DetectedMotionVideoMetadata;
  errors: MotionDraftValidationError[];
}

function readVideoMetadata(
  file: File,
): Promise<{ objectUrl: string; metadata: DetectedMotionVideoMetadata }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.onloadedmetadata = () => {
      resolve({
        objectUrl,
        metadata: {
          mimeType: file.type,
          sizeBytes: file.size,
          width: probe.videoWidth,
          height: probe.videoHeight,
          durationMs: Math.round(probe.duration * 1000),
        },
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read local video metadata"));
    };
    probe.src = objectUrl;
  });
}

export function MotionVideoDraftSheet({ open, onClose }: Props) {
  const [pickerOpen, setPickerOpen] = useState(open);
  const [exercise, setExercise] = useState<{ id: string; name: string } | null>(null);
  const [step, setStep] = useState<Step>("pick-exercise");
  const [detected, setDetected] = useState<DetectedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [conflictStatus, setConflictStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setPickerOpen(true);
      setStep("pick-exercise");
    }
  }, [open]);

  function revokeCurrentPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  // Revoke the local preview object URL on unmount, and whenever it is replaced.
  useEffect(() => () => revokeCurrentPreview(), []);

  function reset() {
    revokeCurrentPreview();
    setExercise(null);
    setStep("pick-exercise");
    setDetected(null);
    setBusy(false);
    setResultMessage(null);
    setBlockedReason(null);
    setConflictStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeAll() {
    reset();
    onClose();
  }

  async function pickExercise(id: string) {
    setPickerOpen(false);
    setBusy(true);
    try {
      const { data } = await supabase
        .from("exercises")
        .select("id,name")
        .eq("id", id)
        .maybeSingle();
      setExercise({ id, name: data?.name ?? "תרגיל" });
      setStep("pick-file");

      const status = await getExerciseMotionDraftStatusServer({ data: { exerciseId: id } });
      if (status.status === "conflict") {
        setConflictStatus(status.currentStatus);
        setStep("conflict");
      }
      // "draft_exists" / "no_active_version" / "not_found" all still allow
      // reaching the file picker - the definitive check happens again,
      // server-side, at upload time (never trust a stale client read).
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בבדיקת מצב התרגיל");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file?: File) {
    if (!file || busy) return;

    revokeCurrentPreview();
    setDetected(null);
    setResultMessage(null);
    setBlockedReason(null);

    if (file.type !== MOTION_VIDEO_MIME_TYPE) {
      toast.error(MOTION_DRAFT_MESSAGES_HE.invalid_mime_type);
      return;
    }

    try {
      const { objectUrl, metadata } = await readVideoMetadata(file);
      objectUrlRef.current = objectUrl;
      const errors = validateDetectedMotionVideoMetadata(metadata);
      setDetected({ file, objectUrl, metadata, errors });
    } catch {
      toast.error("לא ניתן לקרוא את פרטי הווידאו המקומי");
    }
  }

  async function confirmUpload(confirmReplace: boolean) {
    if (!exercise || !detected || detected.errors.length > 0 || busy) return;

    setBusy(true);
    let inboxPath: string | null = null;
    try {
      inboxPath = await uploadMediaInboxFile(detected.file);

      const result = await uploadExerciseMotionDraftServer({
        data: {
          exerciseId: exercise.id,
          inboxSourcePath: inboxPath,
          confirmReplace,
          declaredWidth: detected.metadata.width,
          declaredHeight: detected.metadata.height,
          declaredDurationMs: detected.metadata.durationMs,
        },
      });

      if (result.status === "needs_confirmation") {
        setStep("confirm-replace");
        setBusy(false);
        return;
      }

      if (result.status === "conflict") {
        setConflictStatus(result.currentStatus);
        setStep("conflict");
        setBusy(false);
        return;
      }

      if (result.status === "validation_error") {
        toast.error(result.errors[0]?.message ?? MOTION_DRAFT_MESSAGES_HE.upload_failed);
        setBusy(false);
        return;
      }

      if (result.status === "not_found") {
        toast.error("התרגיל לא נמצא");
        setBusy(false);
        return;
      }

      if (result.status === "failure") {
        if (result.reason === "architectural_blocker") {
          setBlockedReason(MOTION_DRAFT_MESSAGES_HE.architectural_blocker);
          setStep("blocked");
        } else {
          toast.error(MOTION_DRAFT_MESSAGES_HE.upload_failed);
        }
        setBusy(false);
        return;
      }

      // status === "success"
      setResultMessage(MOTION_DRAFT_MESSAGES_HE.draft_saved);
      setStep("done");
      setBusy(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : MOTION_DRAFT_MESSAGES_HE.upload_failed);
      setBusy(false);
    }
    // The Inbox staging copy (inboxPath) is intentionally left in place on
    // every path - same convention as the legacy assignment flow's
    // "post-assign" step - so the Admin can retry without re-selecting the
    // file from the OS picker; nothing here re-uses or deletes it
    // automatically.
  }

  const sheetOpen = !pickerOpen && step !== "pick-exercise" && !!exercise;

  return (
    <>
      <ExercisePicker
        open={pickerOpen && open}
        title="בחר תרגיל לסרטון תנועה"
        onClose={() => {
          setPickerOpen(false);
          if (!exercise) onClose();
        }}
        onSelect={(id) => void pickExercise(id)}
      />

      <Sheet
        open={sheetOpen}
        onOpenChange={(next) => {
          if (!next && busy) return; // prevent closing mid-upload where practical
          if (!next) closeAll();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-start">
            <SheetTitle className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              סרטון תנועה (טיוטה)
            </SheetTitle>
            <SheetDescription className="text-start">{exercise?.name}</SheetDescription>
          </SheetHeader>

          {step === "conflict" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm text-destructive">
                {MOTION_DRAFT_MESSAGES_HE.conflict_non_draft}
                {conflictStatus ? ` (סטטוס נוכחי: ${conflictStatus})` : ""}
              </p>
              <Button className="h-12 w-full" variant="outline" onClick={closeAll}>
                סגור
              </Button>
            </div>
          )}

          {step === "blocked" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm text-destructive">{blockedReason}</p>
              <p className="text-xs text-muted-foreground">
                לא בוצע שינוי חלקי - הקובץ שהועלה הוסר וכל מצב זמני נוקה במלואו.
              </p>
              <Button className="h-12 w-full" variant="outline" onClick={closeAll}>
                סגור
              </Button>
            </div>
          )}

          {step === "done" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm text-primary">{resultMessage}</p>
              <Button className="h-12 w-full" onClick={closeAll}>
                סיום
              </Button>
            </div>
          )}

          {(step === "pick-file" || step === "confirm-replace") && (
            <div className="mt-4 space-y-4 pb-4">
              {step === "confirm-replace" && (
                <p className="text-sm text-destructive">
                  {MOTION_DRAFT_MESSAGES_HE.needs_confirmation}
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                בחר קובץ MP4 מקומי
              </Button>

              {detected && (
                <div className="space-y-3 rounded-xl border border-border/60 p-3">
                  {/* Muted, playsInline, no autoplay; Admin controls playback explicitly. */}
                  <video
                    key={detected.objectUrl}
                    src={detected.objectUrl}
                    muted
                    playsInline
                    controls
                    autoPlay={false}
                    className="w-full rounded-lg motion-reduce:opacity-90"
                    aria-label="תצוגה מקדימה מקומית של סרטון התנועה"
                  />
                  <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt>גודל</dt>
                      <dd dir="ltr">
                        {(detected.metadata.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </dd>
                    </div>
                    <div>
                      <dt>רזולוציה</dt>
                      <dd dir="ltr">
                        {detected.metadata.width}×{detected.metadata.height}
                      </dd>
                    </div>
                    <div>
                      <dt>משך</dt>
                      <dd dir="ltr">{(detected.metadata.durationMs / 1000).toFixed(1)}s</dd>
                    </div>
                  </dl>

                  {detected.errors.length > 0 && (
                    <ul className="space-y-1 text-xs text-destructive">
                      {detected.errors.map((e) => (
                        <li key={e.code}>{e.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Button
                className="h-12 w-full"
                disabled={busy || !detected || detected.errors.length > 0}
                onClick={() => void confirmUpload(step === "confirm-replace")}
              >
                {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                {step === "confirm-replace" ? "אשר החלפה והעלה כטיוטה" : "העלה כטיוטה"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
