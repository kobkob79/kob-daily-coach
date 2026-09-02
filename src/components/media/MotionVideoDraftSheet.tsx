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
import { Checkbox } from "@/components/ui/checkbox";
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
  MOTION_VIDEO_MANUAL_REVIEW_ITEMS,
  MOTION_VIDEO_UNVERIFIED_PROPERTIES,
  createEmptyManualReviewConfirmations,
  isMotionDraftReadyToUpload,
  mapValidationErrorsToAutomaticChecks,
  validateDetectedMotionVideoMetadata,
  type DetectedMotionVideoMetadata,
  type ManualReviewConfirmations,
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

type Step = "pick-exercise" | "pick-file" | "conflict" | "confirm-replace" | "done";

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
  const [frameRatePending, setFrameRatePending] = useState(false);
  const [conflictStatus, setConflictStatus] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<ManualReviewConfirmations>(
    createEmptyManualReviewConfirmations(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Staged Media Inbox path for the currently `detected` file, so a
   * needs_confirmation -> confirm-replace retry reuses the same staged
   * copy instead of uploading the identical bytes to Storage twice. Reset
   * whenever a new file is selected. */
  const stagedRef = useRef<{ file: File; inboxPath: string } | null>(null);

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
    stagedRef.current = null;
    setExercise(null);
    setStep("pick-exercise");
    setDetected(null);
    setBusy(false);
    setResultMessage(null);
    setFrameRatePending(false);
    setConflictStatus(null);
    setConfirmations(createEmptyManualReviewConfirmations());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeAll() {
    reset();
    onClose();
  }

  async function pickExercise(id: string) {
    setPickerOpen(false);
    setBusy(true);
    setConfirmations(createEmptyManualReviewConfirmations());
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
    stagedRef.current = null; // a new file invalidates any previously staged copy
    setDetected(null);
    setResultMessage(null);
    setConfirmations(createEmptyManualReviewConfirmations());

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

  /** Uploads to the Media Inbox staging bucket at most once per selected
   * file - a confirm-replace retry after `needs_confirmation` reuses the
   * same staged copy instead of re-uploading identical bytes. */
  async function ensureStaged(file: File): Promise<string> {
    if (stagedRef.current && stagedRef.current.file === file) {
      return stagedRef.current.inboxPath;
    }
    const inboxPath = await uploadMediaInboxFile(file);
    stagedRef.current = { file, inboxPath };
    return inboxPath;
  }

  async function confirmUpload(confirmReplace: boolean) {
    if (!exercise || !detected || busy) return;
    const ready = isMotionDraftReadyToUpload(
      mapValidationErrorsToAutomaticChecks(detected.metadata, detected.errors),
      confirmations,
    );
    if (!ready) return;

    setBusy(true);
    try {
      const inboxPath = await ensureStaged(detected.file);

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
        toast.error(MOTION_DRAFT_MESSAGES_HE.upload_failed);
        setBusy(false);
        return;
      }

      // status === "success"
      setResultMessage(MOTION_DRAFT_MESSAGES_HE.draft_saved);
      setFrameRatePending(!result.frameRateVerified);
      setStep("done");
      setBusy(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : MOTION_DRAFT_MESSAGES_HE.upload_failed);
      setBusy(false);
    }
    // The Inbox staging copy is intentionally left in place on every path -
    // same convention as the legacy assignment flow's "post-assign" step -
    // so the Admin can retry (via ensureStaged's cache) without re-selecting
    // the file from the OS picker or re-uploading it a second time.
  }

  const sheetOpen = !pickerOpen && step !== "pick-exercise" && !!exercise;
  const automaticChecks = detected
    ? mapValidationErrorsToAutomaticChecks(detected.metadata, detected.errors)
    : [];
  const isReady = detected ? isMotionDraftReadyToUpload(automaticChecks, confirmations) : false;

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

          {step === "done" && (
            <div className="mt-4 space-y-4 pb-4">
              <p className="text-sm text-primary">{resultMessage}</p>
              {frameRatePending && (
                <p className="text-xs text-muted-foreground">
                  קצב הפריימים טרם אומת ויאומת בשלב בקרת האיכות.
                </p>
              )}
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

                  {/* 1. Automatic technical report - reuses
                      validateDetectedMotionVideoMetadata() via
                      mapValidationErrorsToAutomaticChecks(); no second
                      validation implementation. */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      בדיקה טכנית אוטומטית
                    </p>
                    <ul className="space-y-1.5">
                      {automaticChecks.map((check) => (
                        <li
                          key={check.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span>{check.label}</span>
                          <span className="flex items-center gap-2">
                            <span dir="ltr" className="text-muted-foreground">
                              {check.detail}
                            </span>
                            <span
                              className={
                                check.passed
                                  ? "font-semibold text-green-600"
                                  : "font-semibold text-destructive"
                              }
                            >
                              {check.passed ? "PASS" : "FAIL"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 3. Unverified technical properties - never shown as
                      PASS, no detected value fabricated. */}
                  <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      טרם אומת בבדיקה טכנית בצד השרת
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {MOTION_VIDEO_UNVERIFIED_PROPERTIES.map((prop) => (
                        <li key={prop.id}>{prop.label}</li>
                      ))}
                    </ul>
                  </div>

                  {/* 2. Mandatory manual visual-review gate. */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      בדיקה חזותית ידנית (חובה)
                    </p>
                    <ul className="space-y-2">
                      {MOTION_VIDEO_MANUAL_REVIEW_ITEMS.map((item) => (
                        <li key={item.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`manual-review-${item.id}`}
                            checked={confirmations[item.id]}
                            onCheckedChange={(checked) =>
                              setConfirmations((prev) => ({
                                ...prev,
                                [item.id]: checked === true,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`manual-review-${item.id}`}
                            className="text-xs leading-5 cursor-pointer"
                          >
                            {item.label}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <Button
                className="h-12 w-full"
                disabled={busy || !detected || !isReady}
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
