/**
 * "הפרופיל שלי" — the personal Digital Twin screen.
 *
 * Three sections:
 *   1. Editable profile form (avatar + personal + goals + habits).
 *   2. Body-progress gallery, grouped by shooting angle.
 *   3. "What Viora knows about me" — cards that surface persisted
 *      facts + learned patterns (fed from ai_memory).
 *
 * Kept UI on the same premium dark language as the rest of the shell —
 * no visual redesign, just a new surface.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Camera, Upload, Trash2, ChevronLeft, ImagePlus, User, Pencil, X,
  Utensils, Dumbbell, HeartPulse, Activity, Pill, Moon, CalendarClock,
  Sparkles, Target,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  fetchProfile, upsertProfile, uploadAvatar, removeAvatar,
  listBodyPhotos, addBodyPhoto, deleteBodyPhoto,
  ageFromBirthdate, VIEW_ANGLES, GENDERS, ACTIVITY_LEVELS, WORK_TYPES,
  PROFILE_BUCKET, BODY_BUCKET,
  type Profile, type BodyPhoto, type ViewAngle,
} from "@/lib/profile";
import { getAllMemory } from "@/lib/ai-memory";
import { fetchLifeProfile } from "@/lib/life-profile";
import { QAToolsCard } from "@/components/qa/QAToolsCard";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const lifeQ    = useQuery({ queryKey: ["life-profile"], queryFn: fetchLifeProfile });
  const photosQ = useQuery({ queryKey: ["body-photos"], queryFn: listBodyPhotos });
  const memoryQ = useQuery({ queryKey: ["ai-memory-all"], queryFn: getAllMemory });

  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label={t("common.close")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("profile.subtitle")}</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary/50 hover:text-foreground"
        >
          {editing ? <X className="inline h-3.5 w-3.5" /> : <Pencil className="inline h-3.5 w-3.5" />}
          <span className="mr-1">{editing ? t("common.close") : t("profile.edit")}</span>
        </button>
      </div>

      <ProfileHeader profile={profileQ.data ?? null} onChanged={() => qc.invalidateQueries({ queryKey: ["profile"] })} />

      {editing ? (
        <ProfileForm
          profile={profileQ.data ?? null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["profile"] });
            setEditing(false);
          }}
        />
      ) : (
        <ProfileSummary profile={profileQ.data ?? null} life={lifeQ.data ?? null} />
      )}

      <BodyPhotosSection
        photos={photosQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ["body-photos"] })}
      />

      <KnowledgeSection profile={profileQ.data ?? null} memory={memoryQ.data ?? {}} />

      <QAToolsCard />
    </div>
  );
}

/* ---------------- Header (avatar + name) ---------------- */

function ProfileHeader({ profile, onChanged }: { profile: Profile | null; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useSignedUrl(PROFILE_BUCKET, profile?.avatar_url ?? null);

  const upload = useMutation({
    mutationFn: async (f: File) => uploadAvatar(f),
    onSuccess: () => { toast.success(t("profile.saved")); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async () => removeAvatar(profile?.avatar_url ?? null),
    onSuccess: () => { toast.success(t("profile.avatarRemoved")); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const name = profile?.full_name || profile?.display_name || t("profile.namePlaceholder");
  const age = ageFromBirthdate(profile?.birth_date ?? null);

  return (
    <PremiumCard className="flex items-center gap-4">
      <div className="relative">
        <div className="h-20 w-20 overflow-hidden rounded-3xl border border-border/60 bg-muted/40">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <User className="h-8 w-8" />
            </div>
          )}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow"
          aria-label={t("profile.avatar.change")}
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {age != null ? `${t("profile.age")} ${age}` : t("profile.completeHint")}
        </p>
        {profile?.avatar_url && (
          <button
            onClick={() => remove.mutate()}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" /> {t("profile.avatar.remove")}
          </button>
        )}
      </div>
    </PremiumCard>
  );
}

/* ---------------- Summary (read-only view) ---------------- */

function ProfileSummary({ profile, life }: { profile: Profile | null; life: import("@/lib/life-profile").LifeProfile | null }) {
  const workplace = life?.workplace ?? null;
  const jobTitle = life?.job_title ?? null;
  const lifeCtx = life?.life_context ?? null;
  const cycle = life?.shift_cycle ?? null;
  const shiftSummary = cycle
    ? t("profile.shift.summary")
        .replace("{d}", String(cycle.day_shifts))
        .replace("{n}", String(cycle.night_shifts))
        .replace("{o}", String(cycle.off_days))
        .replace("{c}", String(cycle.cycle_length))
    : null;
  const rows: { labelKey: string; value: string | null }[] = [
    { labelKey: "profile.field.fullName", value: profile?.full_name ?? null },
    { labelKey: "profile.field.birthDate", value: profile?.birth_date ?? null },
    { labelKey: "profile.field.gender", value: profile?.gender ? t(`profile.gender.${profile.gender}`) : null },
    { labelKey: "profile.field.height", value: profile?.height_cm ? `${profile.height_cm} ס״מ` : null },
    { labelKey: "profile.field.currentWeight", value: profile?.current_weight_kg ? `${profile.current_weight_kg} ק״ג` : null },
    { labelKey: "profile.field.targetWeight", value: profile?.target_weight_kg ? `${profile.target_weight_kg} ק״ג` : null },
    { labelKey: "profile.field.proteinTarget", value: profile?.protein_target_g ? `${profile.protein_target_g} גרם` : null },
    { labelKey: "profile.field.waterTarget", value: profile?.water_target_ml ? `${profile.water_target_ml} מ״ל` : null },
    { labelKey: "profile.field.calorieTarget", value: profile?.calorie_target ? `${profile.calorie_target} קק״ל` : null },
    { labelKey: "profile.field.activity", value: profile?.activity_level ? t(`profile.activity.${profile.activity_level}`) : null },
    { labelKey: "profile.field.lifeContext", value: lifeCtx ? t(`life.ctx.${lifeCtx}`) : null },
    { labelKey: "profile.field.workplace", value: workplace },
    { labelKey: "profile.field.jobTitle", value: jobTitle },
    { labelKey: "profile.field.workType", value: profile?.work_type ? t(`profile.work.${profile.work_type}`) : null },
    { labelKey: "profile.field.shiftCycle", value: shiftSummary },
  ];

  return (
    <PremiumCard className="p-0">
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.labelKey} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-xs text-muted-foreground">{t(r.labelKey)}</span>
            <span className="text-sm font-medium tabular-nums">
              {r.value || <span className="text-muted-foreground">{t("common.notSet")}</span>}
            </span>
          </li>
        ))}
        {profile?.personal_notes && (
          <li className="px-5 py-3">
            <p className="mb-1 text-xs text-muted-foreground">{t("profile.field.notes")}</p>
            <p className="text-sm leading-relaxed">{profile.personal_notes}</p>
          </li>
        )}
      </ul>
    </PremiumCard>
  );
}

/* ---------------- Editable form ---------------- */

function ProfileForm({ profile, onSaved }: { profile: Profile | null; onSaved: () => void }) {
  const [state, setState] = useState<Partial<Profile>>({});

  useEffect(() => {
    setState(profile ?? {});
  }, [profile]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K] | null) =>
    setState((s) => ({ ...s, [k]: v }));
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

  const save = useMutation({
    mutationFn: async () => upsertProfile(state),
    onSuccess: () => { toast.success(t("profile.saved")); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PremiumCard className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("profile.field.fullName")}>
          <Input
            value={state.full_name ?? ""}
            onChange={(e) => set("full_name", e.target.value || null)}
            dir="rtl"
          />
        </Field>
        <Field label={t("profile.field.birthDate")}>
          <Input
            type="date"
            value={state.birth_date ?? ""}
            onChange={(e) => set("birth_date", e.target.value || null)}
          />
        </Field>
        <Field label={t("profile.field.gender")}>
          <SelectPill
            value={state.gender ?? ""}
            options={GENDERS.map((g) => ({ value: g.key, label: t(g.labelKey) }))}
            onChange={(v) => set("gender", (v || null) as Profile["gender"])}
          />
        </Field>
        <Field label={t("profile.field.height") + " (ס״מ)"}>
          <Input
            type="number"
            inputMode="numeric"
            value={state.height_cm ?? ""}
            onChange={(e) => set("height_cm", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.currentWeight") + " (ק״ג)"}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={state.current_weight_kg ?? ""}
            onChange={(e) => set("current_weight_kg", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.targetWeight") + " (ק״ג)"}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={state.target_weight_kg ?? ""}
            onChange={(e) => set("target_weight_kg", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.proteinTarget") + " (גרם)"}>
          <Input
            type="number"
            inputMode="numeric"
            value={state.protein_target_g ?? ""}
            onChange={(e) => set("protein_target_g", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.waterTarget") + " (מ״ל)"}>
          <Input
            type="number"
            inputMode="numeric"
            value={state.water_target_ml ?? ""}
            onChange={(e) => set("water_target_ml", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.calorieTarget") + " (קק״ל)"}>
          <Input
            type="number"
            inputMode="numeric"
            value={state.calorie_target ?? ""}
            onChange={(e) => set("calorie_target", num(e.target.value))}
          />
        </Field>
        <Field label={t("profile.field.activity")}>
          <SelectPill
            value={state.activity_level ?? ""}
            options={ACTIVITY_LEVELS.map((a) => ({ value: a.key, label: t(a.labelKey) }))}
            onChange={(v) => set("activity_level", (v || null) as Profile["activity_level"])}
          />
        </Field>
        <Field label={t("profile.field.work")} className="sm:col-span-2">
          <SelectPill
            value={state.work_type ?? ""}
            options={WORK_TYPES.map((w) => ({ value: w.key, label: t(w.labelKey) }))}
            onChange={(v) => set("work_type", (v || null) as Profile["work_type"])}
          />
        </Field>
      </div>

      <Field label={t("profile.field.notes")}>
        <Textarea
          rows={3}
          value={state.personal_notes ?? ""}
          onChange={(e) => set("personal_notes", e.target.value || null)}
          dir="rtl"
        />
      </Field>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full">
          {t("action.save")}
        </Button>
      </div>
    </PremiumCard>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectPill({
  value, options, onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
            value === o.value
              ? "border-primary bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Body photos ---------------- */

function BodyPhotosSection({ photos, onChanged }: { photos: BodyPhoto[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<ViewAngle, BodyPhoto[]> = { front: [], back: [], left: [], right: [] };
    for (const p of photos) g[p.view_angle]?.push(p);
    return g;
  }, [photos]);

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t("profile.progress.title")}
        subtitle={t("profile.progress.subtitle")}
        action={
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium hover:border-primary/60"
          >
            <ImagePlus className="ml-1 inline h-3.5 w-3.5" /> {t("profile.progress.add")}
          </button>
        }
      />
      {open && <BodyPhotoComposer onDone={() => { setOpen(false); onChanged(); }} onCancel={() => setOpen(false)} />}

      {photos.length === 0 ? (
        <PremiumCard>
          <EmptyState
            icon={<ImagePlus className="h-5 w-5" />}
            title={t("profile.progress.empty")}
            hint={t("profile.progress.emptyHint")}
          />
        </PremiumCard>
      ) : (
        VIEW_ANGLES.map((a) => grouped[a.key].length > 0 && (
          <div key={a.key}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t(a.labelKey)}</p>
            <div className="grid grid-cols-3 gap-2">
              {grouped[a.key].map((p) => (
                <BodyPhotoThumb key={p.id} photo={p} onDeleted={onChanged} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function BodyPhotoThumb({ photo, onDeleted }: { photo: BodyPhoto; onDeleted: () => void }) {
  const url = useSignedUrl(BODY_BUCKET, photo.image_path);
  const del = useMutation({
    mutationFn: async () => deleteBodyPhoto(photo),
    onSuccess: () => { toast.success(t("profile.progress.deleted")); onDeleted(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground">
          <User className="h-6 w-6" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[10px] text-white">
        <span>{format(new Date(photo.taken_at), "dd/MM")}</span>
        <button
          onClick={() => del.mutate()}
          className="opacity-0 transition group-hover:opacity-100"
          aria-label={t("action.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function BodyPhotoComposer({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [angle, setAngle] = useState<ViewAngle>("front");
  const [lighting, setLighting] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [weight, setWeight] = useState("");

  const pick = (f: File | null) => {
    if (!f) return;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("profile.progress.pickFirst"));
      await addBodyPhoto({
        file, angle,
        lighting_notes: lighting || undefined,
        distance_notes: distance || undefined,
        general_notes: notes || undefined,
        weight_kg: weight ? Number(weight) : null,
      });
    },
    onSuccess: () => { toast.success(t("profile.progress.saved")); if (preview) URL.revokeObjectURL(preview); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PremiumCard className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("profile.progress.add")}</p>
        <button onClick={onCancel} className="rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
          {t("common.cancel")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/30 py-3 text-sm font-medium hover:border-primary/50"
        >
          <Camera className="h-4 w-4" /> {t("capture.take")}
        </button>
        <button
          onClick={() => uploadRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/30 py-3 text-sm font-medium hover:border-primary/50"
        >
          <Upload className="h-4 w-4" /> {t("capture.upload")}
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>

      {preview && (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <img src={preview} alt="" className="max-h-72 w-full object-cover" />
        </div>
      )}

      <Field label={t("profile.progress.angle")}>
        <SelectPill
          value={angle}
          options={VIEW_ANGLES.map((a) => ({ value: a.key, label: t(a.labelKey) }))}
          onChange={(v) => v && setAngle(v as ViewAngle)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("profile.progress.weight") + " (ק״ג)"}>
          <Input type="number" step="0.1" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label={t("profile.progress.lighting")}>
          <Input value={lighting} onChange={(e) => setLighting(e.target.value)} dir="rtl" />
        </Field>
        <Field label={t("profile.progress.distance")}>
          <Input value={distance} onChange={(e) => setDistance(e.target.value)} dir="rtl" />
        </Field>
        <Field label={t("profile.progress.notes")} className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} dir="rtl" />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !file} className="rounded-full">
          {t("profile.progress.save")}
        </Button>
      </div>
    </PremiumCard>
  );
}

/* ---------------- "What Viora knows about me" ---------------- */

interface KnowledgeCard {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  lines: string[];
}

function KnowledgeSection({ profile, memory }: { profile: Profile | null; memory: Record<string, unknown> }) {
  const cards = useMemo<KnowledgeCard[]>(() => {
    const mealHabits = memory["meal_habits"] as { time?: string; food?: string } | undefined;
    const supplements = (memory["supplements"] as { name?: string }[] | undefined) ?? [];
    const weightTrend = memory["weight_trend"] as { deltaKg?: number } | undefined;

    return [
      { icon: Utensils, titleKey: "profile.know.nutrition", lines: [
        profile?.protein_target_g ? `${t("profile.field.proteinTarget")}: ${profile.protein_target_g} גרם` : null,
        profile?.calorie_target ? `${t("profile.field.calorieTarget")}: ${profile.calorie_target} קק״ל` : null,
        profile?.water_target_ml ? `${t("profile.field.waterTarget")}: ${profile.water_target_ml} מ״ל` : null,
        mealHabits?.food ? `${t("profile.know.usualMeal")}: ${mealHabits.food} סביב ${mealHabits.time ?? ""}` : null,
      ].filter(Boolean) as string[] },
      { icon: Dumbbell, titleKey: "profile.know.training", lines: [
        profile?.activity_level ? `${t("profile.field.activity")}: ${t(`profile.activity.${profile.activity_level}`)}` : null,
        profile?.target_weight_kg && profile?.current_weight_kg
          ? `יעד: ${profile.target_weight_kg} ק״ג · נוכחי: ${profile.current_weight_kg} ק״ג`
          : null,
      ].filter(Boolean) as string[] },
      { icon: HeartPulse, titleKey: "profile.know.health", lines: [
        profile?.personal_notes ?? null,
      ].filter(Boolean) as string[] },
      { icon: Activity, titleKey: "profile.know.pain", lines: [
        t("profile.know.painDefault"),
      ] },
      { icon: Pill, titleKey: "profile.know.supplements", lines:
        supplements.length > 0 ? supplements.map((s) => s.name ?? "").filter(Boolean) : [t("profile.know.suppEmpty")] },
      { icon: Moon, titleKey: "profile.know.sleep", lines: [
        t("profile.know.sleepDefault"),
      ] },
      { icon: CalendarClock, titleKey: "profile.know.shift", lines:
        profile?.work_type === "intel_shifts"
          ? [t("profile.know.shiftIntel")]
          : profile?.work_type ? [t(`profile.work.${profile.work_type}`)] : [t("common.notSet")] },
      { icon: Sparkles, titleKey: "profile.know.habits", lines:
        weightTrend?.deltaKg != null
          ? [`מגמת משקל 30 ימים: ${weightTrend.deltaKg > 0 ? "+" : ""}${weightTrend.deltaKg} ק״ג`]
          : [t("profile.know.habitsHint")] },
      { icon: Target, titleKey: "profile.know.goals", lines: [
        profile?.target_weight_kg ? `${t("profile.field.targetWeight")}: ${profile.target_weight_kg} ק״ג` : null,
        profile?.protein_target_g ? `${t("profile.field.proteinTarget")}: ${profile.protein_target_g} גרם` : null,
      ].filter(Boolean) as string[] },
    ];
  }, [profile, memory]);

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t("profile.know.title")}
        subtitle={t("profile.know.subtitle")}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <PremiumCard key={c.titleKey} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold">{t(c.titleKey)}</p>
              </div>
              {c.lines.length > 0 ? (
                <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                  {c.lines.map((l, i) => <li key={i}>• {l}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{t("common.notSet")}</p>
              )}
            </PremiumCard>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- helpers ---------------- */

function useSignedUrl(bucket: string, path: string | null) {
  const q = useQuery({
    queryKey: ["signed-url", bucket, path],
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  return q.data ?? null;
}

/* Developer/QA tools moved to <QAToolsCard> — see src/components/qa/QAToolsCard.tsx */
