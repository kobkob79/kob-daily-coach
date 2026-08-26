/** "הפרופיל שלי" — a compact personal profile and settings surface. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Camera,
  Upload,
  Trash2,
  ChevronLeft,
  ImagePlus,
  User,
  Pencil,
  X,
  Activity,
  Target,
  Info,
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
  fetchProfile,
  upsertProfile,
  uploadAvatar,
  removeAvatar,
  listBodyPhotos,
  addBodyPhoto,
  deleteBodyPhoto,
  ageFromBirthdate,
  VIEW_ANGLES,
  GENDERS,
  ACTIVITY_LEVELS,
  WORK_TYPES,
  PROFILE_BUCKET,
  BODY_BUCKET,
  type Profile,
  type BodyPhoto,
  type ViewAngle,
} from "@/lib/profile";
import { ThemeSelector } from "@/components/ThemeSelector";
import { PlanAndAISection } from "@/components/premium/AIConnectionSection";
export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const photosQ = useQuery({ queryKey: ["body-photos"], queryFn: listBodyPhotos });

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
          {editing ? (
            <X className="inline h-3.5 w-3.5" />
          ) : (
            <Pencil className="inline h-3.5 w-3.5" />
          )}
          <span className="mr-1">{editing ? t("common.close") : t("profile.edit")}</span>
        </button>
      </div>

      <ProfileHeader
        profile={profileQ.data ?? null}
        onChanged={() => qc.invalidateQueries({ queryKey: ["profile"] })}
      />

      {editing ? (
        <ProfileForm
          profile={profileQ.data ?? null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["profile"] });
            setEditing(false);
          }}
        />
      ) : (
        <ProfileSummary profile={profileQ.data ?? null} />
      )}

      <BodyPhotosSection
        photos={photosQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ["body-photos"] })}
      />

      <section className="space-y-3">
        <SectionHeader title="חשבון והגדרות" subtitle="התאמה אישית וחיבורי החשבון שלך" />
        <Link
          to="/about"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 transition hover:border-primary/30 hover:bg-card"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Info className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">על Viora</span>
            <span className="block text-xs text-muted-foreground">האנשים, היועצים והחזון שלנו</span>
          </span>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <PlanAndAISection />
        <ThemeSelector />
      </section>
    </div>
  );
}

/* ---------------- Header (avatar + name) ---------------- */

function ProfileHeader({ profile, onChanged }: { profile: Profile | null; onChanged: () => void }) {
  const qc = useQueryClient();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [avatarStage, setAvatarStage] = useState<"processing" | "uploading" | null>(null);
  const avatar = useSignedUrl(PROFILE_BUCKET, profile?.avatar_url ?? null);

  const invalidateAvatarQueries = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["profile"] }),
      qc.invalidateQueries({ queryKey: ["profile-avatar"] }),
      qc.invalidateQueries({ queryKey: ["signed-url", PROFILE_BUCKET] }),
    ]);
    onChanged();
  };

  const upload = useMutation({
    mutationFn: async (f: File) => uploadAvatar(f, profile?.avatar_url ?? null, setAvatarStage),
    onSuccess: async () => {
      toast.success(t("profile.saved"));
      await invalidateAvatarQueries();
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setAvatarStage(null),
  });

  const remove = useMutation({
    mutationFn: async () => removeAvatar(profile?.avatar_url ?? null),
    onSuccess: async () => {
      toast.success(t("profile.avatarRemoved"));
      await invalidateAvatarQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const name = profile?.full_name || profile?.display_name || t("profile.namePlaceholder");
  const age = ageFromBirthdate(profile?.birth_date ?? null);
  const isAvatarBusy = upload.isPending || remove.isPending;

  const selectAvatar = (file: File | undefined) => {
    if (file && !isAvatarBusy) upload.mutate(file);
  };

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
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={isAvatarBusy}
          className="absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow"
          aria-label={t("profile.avatar.change")}
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          hidden
          onChange={(e) => {
            selectAvatar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            selectAvatar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {age != null ? `${t("profile.age")} ${age}` : t("profile.completeHint")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={isAvatarBusy}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <Upload className="h-3 w-3" /> בחירה מהגלריה
          </button>
          {profile?.avatar_url && (
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={isAvatarBusy}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />{" "}
              {remove.isPending ? "מסיר…" : t("profile.avatar.remove")}
            </button>
          )}
        </div>
        {avatarStage && (
          <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
            {avatarStage === "processing" ? "מעבד את התמונה…" : "מעלה את התמונה…"}
          </p>
        )}
      </div>
    </PremiumCard>
  );
}

/* ---------------- Summary (read-only view) ---------------- */

interface ProfileSummaryItem {
  label: string;
  value: string;
}

function ProfileSummary({ profile }: { profile: Profile | null }) {
  const age = ageFromBirthdate(profile?.birth_date ?? null);
  const personal = [
    age != null ? { label: t("profile.age"), value: String(age) } : null,
    profile?.birth_date
      ? {
          label: t("profile.field.birthDate"),
          value: format(new Date(`${profile.birth_date}T00:00:00`), "dd/MM/yyyy"),
        }
      : null,
    profile?.gender
      ? { label: t("profile.field.gender"), value: t(`profile.gender.${profile.gender}`) }
      : null,
    profile?.height_cm
      ? { label: t("profile.field.height"), value: `${profile.height_cm} ס״מ` }
      : null,
    profile?.current_weight_kg
      ? { label: t("profile.field.currentWeight"), value: `${profile.current_weight_kg} ק״ג` }
      : null,
    profile?.activity_level
      ? {
          label: t("profile.field.activity"),
          value: t(`profile.activity.${profile.activity_level}`),
        }
      : null,
  ].filter((item): item is ProfileSummaryItem => item !== null);

  const goals = [
    profile?.target_weight_kg
      ? { label: t("profile.field.targetWeight"), value: `${profile.target_weight_kg} ק״ג` }
      : null,
    profile?.calorie_target
      ? { label: t("profile.field.calorieTarget"), value: `${profile.calorie_target} קק״ל` }
      : null,
    profile?.protein_target_g
      ? { label: t("profile.field.proteinTarget"), value: `${profile.protein_target_g} גרם` }
      : null,
    profile?.water_target_ml
      ? { label: t("profile.field.waterTarget"), value: `${profile.water_target_ml} מ״ל` }
      : null,
    profile?.work_type
      ? { label: t("profile.field.workType"), value: t(`profile.work.${profile.work_type}`) }
      : null,
  ].filter((item): item is ProfileSummaryItem => item !== null);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ProfileSummaryCard
        icon={<User className="h-4 w-4" />}
        title="פרטים אישיים"
        items={personal}
        emptyText="אפשר להוסיף פרטים אישיים דרך עריכת הפרופיל"
      />
      <ProfileSummaryCard
        icon={<Target className="h-4 w-4" />}
        title="העדפות ויעדים"
        items={goals}
        emptyText="עוד לא הוגדרו יעדים והעדפות"
      />
    </div>
  );
}

function ProfileSummaryCard({
  icon,
  title,
  items,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  items: ProfileSummaryItem[];
  emptyText: string;
}) {
  return (
    <PremiumCard className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {items.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          {items.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{emptyText}</p>
      )}
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
    onSuccess: () => {
      toast.success(t("profile.saved"));
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PremiumCard className="space-y-4">
      <ProfileFormGroup title="פרטים אישיים" icon={<User className="h-4 w-4" />}>
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
        </div>
      </ProfileFormGroup>

      <ProfileFormGroup title="יעדים" icon={<Target className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
      </ProfileFormGroup>

      <ProfileFormGroup title="אורח חיים" icon={<Activity className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("profile.field.activity")}>
            <SelectPill
              value={state.activity_level ?? ""}
              options={ACTIVITY_LEVELS.map((a) => ({ value: a.key, label: t(a.labelKey) }))}
              onChange={(v) => set("activity_level", (v || null) as Profile["activity_level"])}
            />
          </Field>
          <Field label={t("profile.field.work")}>
            <SelectPill
              value={state.work_type ?? ""}
              options={WORK_TYPES.map((w) => ({ value: w.key, label: t(w.labelKey) }))}
              onChange={(v) => set("work_type", (v || null) as Profile["work_type"])}
            />
          </Field>
          <Field label={t("profile.field.notes")} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={state.personal_notes ?? ""}
              onChange={(e) => set("personal_notes", e.target.value || null)}
              dir="rtl"
            />
          </Field>
        </div>
      </ProfileFormGroup>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full">
          {t("action.save")}
        </Button>
      </div>
    </PremiumCard>
  );
}

function ProfileFormGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/15 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectPill({
  value,
  options,
  onChange,
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
      {open && (
        <BodyPhotoComposer
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
          onCancel={() => setOpen(false)}
        />
      )}

      {photos.length === 0 ? (
        <PremiumCard>
          <EmptyState
            icon={<ImagePlus className="h-5 w-5" />}
            title={t("profile.progress.empty")}
            hint={t("profile.progress.emptyHint")}
          />
        </PremiumCard>
      ) : (
        VIEW_ANGLES.map(
          (a) =>
            grouped[a.key].length > 0 && (
              <div key={a.key}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t(a.labelKey)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {grouped[a.key].map((p) => (
                    <BodyPhotoThumb key={p.id} photo={p} onDeleted={onChanged} />
                  ))}
                </div>
              </div>
            ),
        )
      )}
    </section>
  );
}

function BodyPhotoThumb({ photo, onDeleted }: { photo: BodyPhoto; onDeleted: () => void }) {
  const url = useSignedUrl(BODY_BUCKET, photo.image_path);
  const del = useMutation({
    mutationFn: async () => deleteBodyPhoto(photo),
    onSuccess: () => {
      toast.success(t("profile.progress.deleted"));
      onDeleted();
    },
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
        file,
        angle,
        lighting_notes: lighting || undefined,
        distance_notes: distance || undefined,
        general_notes: notes || undefined,
        weight_kg: weight ? Number(weight) : null,
      });
    },
    onSuccess: () => {
      toast.success(t("profile.progress.saved"));
      if (preview) URL.revokeObjectURL(preview);
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PremiumCard className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("profile.progress.add")}</p>
        <button
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
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
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
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
          <Input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
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
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !file}
          className="rounded-full"
        >
          {t("profile.progress.save")}
        </Button>
      </div>
    </PremiumCard>
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
