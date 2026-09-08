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
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { WorkoutResultCard } from "@/components/community/WorkoutResultCard";
import { getSession, getSessionSets } from "@/lib/workout-session";
import { buildDebriefContext } from "@/lib/coach-debrief";
import { generateCoachDebrief } from "@/lib/coach-debrief.functions";
import type { CoachDebriefResult } from "@/lib/coach-debrief-safety";
import { fetchLifeProfile } from "@/lib/life-profile";
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

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/debrief/share")({
  component: WorkoutShareStudio,
});

function WorkoutShareStudio() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  const generateDebrief = useServerFn(generateCoachDebrief);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingQ = useQuery({
    queryKey: ["workout-share-existing", sessionId],
    queryFn: () => findExisting({ data: { sessionId } }),
  });

  const sourceQ = useQuery({
    queryKey: ["workout-share-source", sessionId],
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

  // Same queryKey as the debrief screen — a cache hit there, no extra AI call.
  const debriefQ = useQuery({
    queryKey: ["coach-debrief", sessionId],
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const profile = await fetchLifeProfile().catch(() => null);
      const ctx = await buildDebriefContext(sessionId, profile?.first_name ?? "");
      return generateDebrief({ data: ctx });
    },
  });

  const debriefResult: CoachDebriefResult | undefined = debriefQ.data;
  const coach: WorkoutShareCoachInput | null =
    debriefResult?.status === "ok"
      ? {
          greeting: debriefResult.debrief.greeting,
          paragraphs: debriefResult.debrief.paragraphs,
          highlights: debriefResult.debrief.highlights,
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

  const onPickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
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

      return publish({
        data: {
          sessionId,
          caption: caption.trim() || null,
          photoPath,
          audience,
          locationLabel: locationOn ? locationLabel.trim() || null : null,
          includeCoach,
          coach: includeCoach ? coach : null,
        },
      });
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

  const loading = sourceQ.isLoading || existingQ.isLoading;
  const alreadyShared = existingQ.data?.status === "found";

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-4">
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
      ) : !sourceQ.data ? (
        <p className="py-16 text-center text-sm text-muted-foreground">האימון לא נמצא.</p>
      ) : alreadyShared ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">כבר שיתפת את האימון הזה בקהילה.</p>
          {existingQ.data?.status === "found" && (
            <WorkoutResultCard payload={existingQ.data.payload} />
          )}
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link to="/community">עבור לקהילה</Link>
          </Button>
        </div>
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
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
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
              hint={!coach ? "התחקיר אינו זמין כרגע" : undefined}
            />

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-semibold">קהל</legend>
              <div className="flex gap-2">
                <AudienceOption
                  label="כל קהילת Viora"
                  selected={audience === "public"}
                  onSelect={() => setAudience("public")}
                />
                <AudienceOption
                  label="עוקבים בלבד"
                  selected={audience === "followers"}
                  onSelect={() => setAudience("followers")}
                />
              </div>
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

          <Button
            size="lg"
            className="h-14 w-full text-lg"
            disabled={publishMut.isPending}
            onClick={() => publishMut.mutate()}
          >
            {publishMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "פרסם בקהילה"}
          </Button>
        </>
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

function AudienceOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
