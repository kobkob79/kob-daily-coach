/**
 * Workout Share Studio (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1) — full-screen,
 * mobile-first RTL screen to publish a completed workout to the Community
 * feed as a structured "workout_result" post.
 *
 * The live preview renders the exact same WorkoutResultCard component the
 * feed uses, fed by the exact same buildWorkoutSharePayload pure function
 * the server-side publish path uses — the preview cannot drift from what
 * actually gets published. The user can only affect presentation
 * (caption, photo, which sections show, audience, location) — every
 * metric field comes from the already-persisted session and is
 * recalculated server-side at publish time regardless of what the client
 * sends.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { toast } from "sonner";
import { ChevronRight, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { WorkoutResultCard } from "@/components/community/WorkoutResultCard";
import { getSession, getSessionSets } from "@/lib/workout-session";
import { getWorkoutDebriefSnapshot } from "@/lib/coach-debrief.functions";
import {
  buildWorkoutSharePayload,
  WORKOUT_SHARE_CAPTION_MAX_LENGTH,
  type WorkoutShareCoachInput,
} from "@/lib/community-workout-share";
import {
  findExistingWorkoutShare,
  publishWorkoutShare,
  type WorkoutShareAudience,
} from "@/lib/community-workout-share.functions";

const PHOTO_BUCKET = "community-post-photos";
// Matches the community-post-photos bucket's own allowed_mime_types/file_size_limit
// (supabase/migrations/20260908150000_community_post_structured_types.sql) — reject
// obviously-wrong files with a clear message instead of an opaque upload failure.
const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/debrief/share")({
  component: WorkoutShareStudio,
});

function WorkoutShareStudio() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  const fetchDebriefSnapshot = useServerFn(getWorkoutDebriefSnapshot);
  const publish = useServerFn(publishWorkoutShare);
  const findExisting = useServerFn(findExistingWorkoutShare);

  const [caption, setCaption] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [includeCoach, setIncludeCoach] = useState(true);
  const [audience, setAudience] = useState<WorkoutShareAudience>("public");
  const [locationOn, setLocationOn] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewRef = useRef<string | null>(null);

  // Revoke the object URL on unmount too, not only when replaced/removed —
  // navigating away mid-edit (e.g. the back button) leaked it otherwise.
  useEffect(() => {
    return () => {
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    };
  }, []);

  const existingQ = useQuery({
    queryKey: ["workout-share-existing", sessionId],
    queryFn: () => findExisting({ data: { sessionId } }),
  });

  const existingPhotoPath = existingQ.data?.status === "found" ? existingQ.data.photoPath : null;
  const existingPhotoUrlQ = useQuery({
    queryKey: ["workout-share-existing-photo-url", existingPhotoPath],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(existingPhotoPath!, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: Boolean(existingPhotoPath),
  });

  // Codex re-review round 2, blocker 6: when the workout is already
  // shared, the composer below is never rendered — there's no need to
  // load the session/sets/exercises or the debrief snapshot at all. Wait
  // for existingQ to actually resolve to "not_found" before either query
  // is even enabled, instead of firing all three in parallel every time.
  const needsComposerData = existingQ.data?.status === "not_found";

  const sourceQ = useQuery({
    queryKey: ["workout-share-source", sessionId],
    enabled: needsComposerData,
    queryFn: async () => {
      const [session, sets] = await Promise.all([getSession(sessionId), getSessionSets(sessionId)]);
      if (!session) return null;
      const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
      const { data: exRows } = exerciseIds.length
        ? await supabase.from("exercises").select("id,name,muscle_group").in("id", exerciseIds)
        : { data: [] as { id: string; name: string; muscle_group: string | null }[] };
      const exercisesById = new Map((exRows ?? []).map((e) => [e.id, e] as const));
      return { session, sets, exercisesById };
    },
  });

  // Read-only — never generates. Opening Share Studio (including a direct
  // URL visit or a refresh) makes zero OpenAI calls; this only reads
  // whatever the debrief screen already generated and saved for this
  // session, if anything. If nothing was ever generated (or it failed),
  // the coach section is simply unavailable — sharing the workout itself
  // never depends on it.
  const debriefQ = useQuery({
    queryKey: ["workout-debrief-snapshot", sessionId],
    enabled: needsComposerData,
    queryFn: () => fetchDebriefSnapshot({ data: { sessionId } }),
  });

  const coach: WorkoutShareCoachInput | null =
    debriefQ.data?.status === "found"
      ? {
          greeting: debriefQ.data.debrief.greeting,
          paragraphs: debriefQ.data.debrief.paragraphs,
          highlights: debriefQ.data.debrief.highlights,
        }
      : null;

  const payload =
    sourceQ.data &&
    buildWorkoutSharePayload({
      session: sourceQ.data.session,
      sets: sourceQ.data.sets,
      exercisesById: sourceQ.data.exercisesById,
      caption,
      locationLabel: locationOn ? locationLabel : null,
      coach: includeCoach ? coach : null,
    });

  const setPreview = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      const next = file ? URL.createObjectURL(file) : null;
      photoPreviewRef.current = next;
      return next;
    });
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file) {
      setPreview(null);
      return;
    }
    if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.type)) {
      toast.error("סוג הקובץ אינו נתמך — יש לבחור תמונת JPEG, PNG או WebP");
      return;
    }
    setPhotoProcessing(true);
    try {
      const compressed = await compressImageFile(file);
      if (compressed.size > MAX_PHOTO_BYTES) {
        toast.error("התמונה גדולה מדי");
        return;
      }
      setPreview(compressed);
    } finally {
      setPhotoProcessing(false);
    }
  };

  const publishMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("יש להתחבר מחדש");

      let photoPath: string | null = null;
      if (photoFile) {
        const dot = photoFile.name.lastIndexOf(".");
        const ext = dot > 0 ? photoFile.name.slice(dot + 1) : "jpg";
        const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photoFile, {
          contentType: photoFile.type,
          upsert: false,
        });
        if (error) throw error;
        photoPath = path;
      }

      // Cleanup (Codex review finding 5): if a photo was just uploaded but
      // publishing doesn't end up using it — the session turned out to
      // already have a post, the publish call failed outright, or it threw
      // — delete the orphaned upload rather than leaving it in Storage
      // with nothing pointing at it. Never touches a photo that made it
      // into a successfully published post.
      const cleanupOrphanedUpload = async () => {
        if (photoPath) {
          await supabase.storage
            .from(PHOTO_BUCKET)
            .remove([photoPath])
            .catch(() => {});
        }
      };

      let result;
      try {
        result = await publish({
          data: {
            sessionId,
            caption: caption.trim() || null,
            photoPath,
            audience,
            locationLabel: locationOn ? locationLabel.trim() || null : null,
            includeCoach,
          },
        });
      } catch (e) {
        await cleanupOrphanedUpload();
        throw e;
      }

      if (result.status === "error" || result.status === "already_shared") {
        await cleanupOrphanedUpload();
      }
      return result;
    },
    onSuccess: (result) => {
      if (result.status === "published" || result.status === "already_shared") {
        setAnnouncement("האימון פורסם בקהילה");
        toast.success("האימון פורסם בקהילה");
        navigate({ to: "/community" });
        return;
      }
      const message =
        result.reason === "SESSION_NOT_COMPLETED"
          ? "אפשר לשתף רק אימון שהסתיים"
          : result.reason === "SESSION_NOT_FOUND"
            ? "האימון לא נמצא"
            : "השיתוף נכשל, נסה שוב";
      setAnnouncement(message);
      toast.error(message);
    },
    onError: () => {
      setAnnouncement("השיתוף נכשל, נסה שוב");
      toast.error("השיתוף נכשל, נסה שוב");
    },
  });

  // sourceQ is disabled until existingQ resolves to "not_found", so its
  // own isLoading is meaningless (false-but-not-yet-started) until then —
  // only count it once it's actually the query in flight.
  const loading = existingQ.isLoading || (needsComposerData && sourceQ.isLoading);
  const alreadyShared = existingQ.data?.status === "found";
  const showComposer = !loading && Boolean(sourceQ.data) && !alreadyShared;

  return (
    // pb-28 (+ the sticky bar's own safe-area padding below) keeps the last
    // preview content clear of the fixed publish bar — otherwise the
    // bottom of the live preview sits underneath it on short screens.
    <div dir="rtl" className={`mx-auto max-w-md space-y-4 py-4 ${showComposer ? "pb-28" : ""}`}>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts/session/$sessionId/debrief" params={{ sessionId }}>
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">שתף אימון</h1>
        <div className="w-16" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען...
        </div>
      ) : /* alreadyShared must be checked before `!sourceQ.data` — sourceQ
             is now disabled (blocker 6) whenever the workout is already
             shared, so sourceQ.data is always undefined in that state; a
             `!sourceQ.data` check first would misroute to "not found". */
      alreadyShared ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">כבר שיתפת את האימון הזה בקהילה.</p>
          {existingQ.data?.status === "found" &&
            (existingQ.data.payload ? (
              <WorkoutResultCard
                payload={existingQ.data.payload}
                photoUrl={existingPhotoUrlQ.data}
              />
            ) : (
              // Codex re-review round 2, blocker 5: a stored payload that
              // fails runtime validation must show a safe fallback, never
              // an empty/broken card built from an unchecked cast.
              <p className="surface-card p-4 text-sm text-muted-foreground">
                לא ניתן להציג את נתוני האימון הזה כרגע.
              </p>
            ))}
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link to="/community">עבור לקהילה</Link>
          </Button>
        </div>
      ) : !sourceQ.data ? (
        <p className="py-16 text-center text-sm text-muted-foreground">האימון לא נמצא.</p>
      ) : (
        <>
          <div className="surface-card space-y-3 p-4">
            <label htmlFor="share-caption" className="text-sm font-semibold">
              כיתוב אישי
            </label>
            <Textarea
              id="share-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="איך היה האימון?"
              className="min-h-[70px] resize-none text-right"
              maxLength={WORKOUT_SHARE_CAPTION_MAX_LENGTH}
            />

            {photoPreview && (
              <div className="relative inline-block">
                <img
                  src={photoPreview}
                  alt=""
                  className="max-h-48 rounded-2xl border border-border/60 object-cover"
                />
                <button
                  type="button"
                  onClick={() => onPickPhoto(null)}
                  className="absolute -top-2 -left-2 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground shadow-soft"
                  aria-label="הסר תמונה"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={photoProcessing}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {photoFile ? "החלף תמונה" : "הוסף תמונה"}
            </Button>
          </div>

          <div className="surface-card space-y-3 p-4">
            <ToggleRow
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              label="כלול תחקיר מאמן"
              checked={includeCoach}
              onChange={setIncludeCoach}
              disabled={!coach}
              hint={
                !coach ? (debriefQ.isLoading ? "בודק זמינות…" : "התחקיר אינו זמין כרגע") : undefined
              }
            />

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-semibold">קהל</legend>
              <RadioGroupPrimitive.Root
                value={audience}
                onValueChange={(v) => setAudience(v as WorkoutShareAudience)}
                className="flex gap-2"
              >
                <AudienceOption value="public" label="כל קהילת Viora" />
                <AudienceOption value="followers" label="עוקבים בלבד" />
              </RadioGroupPrimitive.Root>
            </fieldset>

            <ToggleRow
              icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
              label="הצג מיקום"
              checked={locationOn}
              onChange={(v) => {
                setLocationOn(v);
                if (!v) setLocationLabel("");
              }}
            />
            {locationOn && (
              <Input
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="לדוגמה: מכון הכושר שלי"
                aria-label="שם המיקום"
                maxLength={120}
              />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">תצוגה מקדימה</p>
            {payload && (
              <WorkoutResultCard payload={payload} photoUrl={photoPreview ?? undefined} />
            )}
          </div>
        </>
      )}

      {/* Fixed bottom publish bar (Codex review finding 9) — a plain
          block-flow button at the end of the page was pushed off-screen by
          mobile browser chrome and, on some devices, sat under the
          on-screen keyboard while the caption/location fields had focus.
          Fixed + safe-area padding keeps it reachable at all times; the
          content column above reserves matching bottom space (pb-28) so it
          never overlaps the live preview. */}
      {showComposer && (
        <div
          className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto max-w-md p-4">
            <Button
              size="lg"
              className="h-14 w-full text-lg"
              disabled={publishMut.isPending}
              onClick={() => publishMut.mutate()}
            >
              {publishMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "פרסם בקהילה"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
        {hint && <span className="text-xs text-muted-foreground">({hint})</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative min-h-11 min-w-11 rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow transition-transform motion-reduce:transition-none ${
            checked ? "right-6" : "right-1"
          }`}
        />
      </button>
    </div>
  );
}

function AudienceOption({ value, label }: { value: WorkoutShareAudience; label: string }) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      className="min-h-11 flex-1 rounded-xl border border-border/60 px-3 text-sm font-medium text-muted-foreground transition-colors motion-reduce:transition-none data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
    >
      {label}
    </RadioGroupPrimitive.Item>
  );
}
