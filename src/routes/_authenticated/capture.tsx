import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Camera, Upload, Sparkles, Trash2, ChevronLeft, ImagePlus, Loader2,
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
import { today } from "@/lib/date";
import { analyzeMealImage } from "@/lib/meal-vision";
import {
  CAPTURE_TYPES, CAPTURE_TYPE_BY_KEY, CAPTURE_BUCKET,
  type CaptureType, type CaptureTypeDef, type CaptureStatus,
} from "@/lib/vision";

export const Route = createFileRoute("/_authenticated/capture")({
  component: CapturePage,
});

type CaptureRow = {
  id: string;
  capture_type: CaptureType;
  image_path: string | null;
  ai_status: CaptureStatus;
  extracted: Record<string, unknown>;
  notes: string | null;
  captured_at: string;
};

function CapturePage() {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<CaptureType | null>(null);

  const historyQ = useQuery({
    queryKey: ["vision-captures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vision_captures" as never)
        .select("id,capture_type,image_path,ai_status,extracted,notes,captured_at")
        .order("captured_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CaptureRow[];
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label={t("common.close")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("capture.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("capture.subtitle")}</p>
        </div>
      </div>

      {activeType ? (
        <CaptureComposer
          def={CAPTURE_TYPE_BY_KEY[activeType]}
          onDone={() => {
            setActiveType(null);
            qc.invalidateQueries({ queryKey: ["vision-captures"] });
          }}
          onCancel={() => setActiveType(null)}
        />
      ) : (
        <CaptureTypeGrid onPick={setActiveType} />
      )}

      <section>
        <SectionHeader
          title={t("capture.history")}
          subtitle={historyQ.data?.length ? `${historyQ.data.length}` : undefined}
        />
        <PremiumCard className="p-0 overflow-hidden">
          {historyQ.isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : historyQ.data && historyQ.data.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {historyQ.data.map((row) => (
                <HistoryRow key={row.id} row={row} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<ImagePlus className="h-5 w-5" />}
              title={t("capture.empty")}
              hint={t("capture.subtitle")}
            />
          )}
        </PremiumCard>
      </section>
    </div>
  );
}

function CaptureTypeGrid({ onPick }: { onPick: (t: CaptureType) => void }) {
  return (
    <section>
      <SectionHeader title={t("capture.pick")} />
      <div className="grid grid-cols-2 gap-3">
        {CAPTURE_TYPES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onPick(c.key)}
              className={cn(
                "group flex flex-col gap-2 rounded-3xl border border-border/60 bg-card/70 p-4 text-start",
                "shadow-soft backdrop-blur-xl transition-all",
                "hover:border-primary/50 hover:shadow-glow active:scale-[0.98]",
              )}
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary"
                aria-hidden
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold leading-tight">{t(c.labelKey)}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{t(c.hintKey)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CaptureComposer({
  def, onDone, onCancel,
}: {
  def: CaptureTypeDef;
  onDone: () => void;
  onCancel: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const Icon = def.icon;

  const pickFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setConfidence(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const runAnalyze = async () => {
    if (!file) {
      toast.error(t("capture.needImage"));
      return;
    }
    if (def.key !== "meal") {
      toast.info(t("capture.aiSoon"));
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeMealImage(file);
      setValues((s) => ({
        ...s,
        dish: res.dish,
        ingredients: res.ingredients,
        calories: String(res.calories),
        protein_g: String(res.protein_g),
        carbs_g: String(res.carbs_g),
        fat_g: String(res.fat_g),
        fiber_g: String(res.fiber_g),
      }));
      setConfidence(res.confidence);
      toast.success(t("capture.analysisDone"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };


  const save = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      let imagePath: string | null = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${userRes.user.id}/${def.key}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(CAPTURE_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
        if (upErr) throw upErr;
        imagePath = path;
      }
      const extracted: Record<string, unknown> = {};
      for (const f of def.fields) {
        const v = values[f.key]?.trim();
        if (!v) continue;
        extracted[f.key] = f.type === "number" ? Number(v) : v;
      }
      const { error } = await supabase
        .from("vision_captures" as never)
        .insert({
          user_id: userRes.user.id,
          capture_type: def.key,
          image_path: imagePath,
          ai_status: confidence != null ? "done" : "pending",
          extracted,
          notes: notes || null,
        } as never);
      if (error) throw error;

      // For meal captures, mirror the analysis into nutrition_entries so it
      // shows up in the daily protein total, meals list and timeline.
      if (def.key === "meal") {
        const dish = (extracted.dish as string) || "ארוחה";
        await supabase.from("nutrition_entries").insert({
          user_id: userRes.user.id,
          date: today(),
          meal_time: format(new Date(), "HH:mm:ss"),
          meal: "snack",
          food_name: dish,
          meal_type: "snack",
          calories: Number(extracted.calories ?? 0),
          protein_g: Number(extracted.protein_g ?? 0),
          carbs_g: Number(extracted.carbs_g ?? 0),
          fat_g: Number(extracted.fat_g ?? 0),
          notes: (extracted.ingredients as string) ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success(t("capture.saved"));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PremiumCard className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{t(def.labelKey)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{t(def.hintKey)}</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common.cancel")}
        </button>
      </div>

      {/* Image preview / picker */}
      <div>
        {previewUrl ? (
          <div className="relative overflow-hidden rounded-2xl border border-border/60">
            <img src={previewUrl} alt={t("capture.preview")} className="max-h-72 w-full object-cover" />
            <button
              onClick={() => { setFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
              className="absolute top-2 end-2 rounded-full bg-background/85 px-3 py-1 text-xs backdrop-blur"
            >
              {t("capture.retake")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border/70 bg-muted/30 py-6 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Camera className="h-5 w-5" />
              {t("capture.take")}
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border/70 bg-muted/30 py-6 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Upload className="h-5 w-5" />
              {t("capture.upload")}
            </button>
          </div>
        )}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture={def.cameraFacing}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* AI placeholder */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/8 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">{t("capture.aiTitle")} · {t("capture.aiSoon")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("capture.aiSoonHint")}</p>
        </div>
      </div>

      {/* Structured fields */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("capture.fields")}
        </p>
        <div className="grid grid-cols-1 gap-3">
          {def.fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{t(f.labelKey)}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  rows={2}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs">{t("capture.notes")}</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button
        className="w-full"
        onClick={() => save.mutate()}
        disabled={save.isPending || (!file && Object.values(values).every((v) => !v?.trim()))}
      >
        {t("capture.save")}
      </Button>
    </PremiumCard>
  );
}

function HistoryRow({ row }: { row: CaptureRow }) {
  const qc = useQueryClient();
  const def = CAPTURE_TYPE_BY_KEY[row.capture_type];
  const Icon = def?.icon ?? ImagePlus;
  const signedUrl = useSignedUrl(row.image_path);

  const remove = useMutation({
    mutationFn: async () => {
      if (row.image_path) {
        await supabase.storage.from(CAPTURE_BUCKET).remove([row.image_path]);
      }
      const { error } = await supabase.from("vision_captures" as never).delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("capture.deleted"));
      qc.invalidateQueries({ queryKey: ["vision-captures"] });
    },
  });

  const summary = useMemo(() => {
    const entries = Object.entries(row.extracted ?? {}).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
  }, [row.extracted]);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {signedUrl ? (
        <img src={signedUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
      ) : (
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{def ? t(def.labelKey) : row.capture_type}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {format(new Date(row.captured_at), "d/M HH:mm")}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t(`capture.status.${row.ai_status}`)}
        </p>
        {summary && <p className="mt-0.5 truncate text-[11px] text-foreground/80">{summary}</p>}
        {row.notes && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.notes}</p>}
      </div>
      <button
        onClick={() => remove.mutate()}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={t("action.delete")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function useSignedUrl(path: string | null) {
  const q = useQuery({
    queryKey: ["vision-signed", path],
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  return q.data ?? null;
}
