import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumCard } from "@/components/ui-kit/Section";
import {
  ABOUT_MEDIA_SUBJECTS,
  getAboutMediaLimit,
  validateAboutMediaSourceFile,
  type AboutMediaSubject,
  type AdminAboutMediaRecord,
} from "@/lib/about-media";
import { optimizeAboutMediaFile } from "@/lib/about-media-optimizer";
import {
  deleteAboutMedia,
  getAdminAboutMedia,
  reorderAboutMedia,
  replaceAboutMedia,
  setPrimaryAboutMedia,
  updateAboutMedia,
  uploadAboutMedia,
} from "@/lib/about-media.functions";
import { cn } from "@/lib/utils";

const SUBJECT_LABELS: Record<AboutMediaSubject, string> = {
  team: "תמונת צוות",
  kobi: "קובי",
  adam: "אדם",
  daniel: "דניאל",
  maya: "מאיה",
  shiran: "שירן",
};
const QUERY_KEY = ["admin", "about-media"] as const;
type UploadStage = "מכין תמונה" | "מכווץ" | "מעלה" | "הושלם" | "נכשל";
type UploadJob = {
  id: string;
  file: File;
  stage: UploadStage;
  optimizedSize?: number;
  error?: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function AboutMediaManager() {
  const queryClient = useQueryClient();
  const uploadInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const submittedFingerprints = useRef(new Set<string>());
  const [subject, setSubject] = useState<AboutMediaSubject>("team");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getAdminAboutMedia });
  const records = useMemo(
    () => (query.data ?? []).filter((item) => item.subject === subject),
    [query.data, subject],
  );
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["about-media"] }),
    ]);
  };

  const action = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      await invalidate();
      toast.success("השינוי נשמר");
    },
    onError: () => toast.error("לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב."),
    onSettled: () => setProgress(null),
  });

  const updateJob = (id: string, update: Partial<UploadJob>) =>
    setUploadJobs((jobs) => jobs.map((job) => (job.id === id ? { ...job, ...update } : job)));

  const uploadOne = async (job: UploadJob) => {
    try {
      updateJob(job.id, { stage: "מכווץ", error: undefined });
      const optimized = await optimizeAboutMediaFile(job.file);
      updateJob(job.id, { stage: "מעלה", optimizedSize: optimized.size });
      await uploadAboutMedia({
        data: {
          subject,
          dataUrl: await fileToDataUrl(optimized),
          altText: SUBJECT_LABELS[subject],
        },
      });
      updateJob(job.id, { stage: "הושלם" });
      await invalidate();
    } catch (error) {
      updateJob(job.id, {
        stage: "נכשל",
        error: error instanceof Error ? error.message : "ההעלאה נכשלה.",
      });
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || action.isPending || isBatchUploading) return;
    const available = getAboutMediaLimit(subject) - records.filter((item) => item.is_active).length;
    const fingerprints = new Set<string>();
    const selected = Array.from(files).filter((file) => {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (fingerprints.has(fingerprint) || submittedFingerprints.current.has(fingerprint))
        return false;
      fingerprints.add(fingerprint);
      return true;
    });
    if (selected.length > available)
      return toast.error(
        subject === "team"
          ? "לתמונת הצוות ניתן לשמור תמונה פעילה אחת."
          : `אפשר לשמור עד ${getAboutMediaLimit(subject)} תמונות פעילות.`,
      );
    for (const file of selected) {
      const validation = validateAboutMediaSourceFile(file);
      if (validation) return toast.error(validation);
    }
    const jobs = selected.map((file) => ({
      id: crypto.randomUUID(),
      file,
      stage: "מכין תמונה" as const,
    }));
    for (const fingerprint of fingerprints) submittedFingerprints.current.add(fingerprint);
    setUploadJobs(jobs);
    setIsBatchUploading(true);
    for (const job of jobs) await uploadOne(job);
    setIsBatchUploading(false);
  };

  const replaceFile = async (file: File | undefined) => {
    if (!file || !replaceId) return;
    const validation = validateAboutMediaSourceFile(file);
    if (validation) return toast.error(validation);
    action.mutate(async () => {
      setProgress("מכווץ");
      const optimized = await optimizeAboutMediaFile(file);
      setProgress("מעלה");
      return replaceAboutMedia({
        data: { id: replaceId, dataUrl: await fileToDataUrl(optimized) },
      });
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= records.length) return;
    const ids = records.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    action.mutate(() => reorderAboutMedia({ data: { subject, ids } }));
  };

  return (
    <PremiumCard className="space-y-4 border-border/70 bg-card/85 p-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
          <ImagePlus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">צוות וגלריות</h3>
          <p className="text-[10px] text-muted-foreground">תמונות About שפורסמו באתר</p>
        </div>
        {action.isPending && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="בחירת אדם">
        {ABOUT_MEDIA_SUBJECTS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={action.isPending}
            onClick={() => setSubject(value)}
            className={cn(
              "min-h-10 rounded-xl border px-2 text-[11px] font-bold",
              subject === value
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border/60 bg-muted/20",
            )}
          >
            {SUBJECT_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-primary/35 bg-primary/5 p-4 text-center">
        <Upload className="mx-auto h-5 w-5 text-primary" />
        <p className="mt-2 text-xs font-semibold">JPEG, PNG או WebP · כיווץ אוטומטי לפני העלאה</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {subject === "team"
            ? "תמונה פעילה אחת"
            : `עד ${getAboutMediaLimit(subject)} תמונות פעילות`}
        </p>
        <Button
          className="mt-3"
          size="sm"
          disabled={
            action.isPending || isBatchUploading || records.length >= getAboutMediaLimit(subject)
          }
          onClick={() => uploadInput.current?.click()}
        >
          {progress ?? "בחירת תמונות"}
        </Button>
        <input
          ref={uploadInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={subject !== "team"}
          onChange={(event) => {
            void uploadFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {uploadJobs.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {uploadJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{job.file.name}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  מקור {formatBytes(job.file.size)}
                  {job.optimizedSize ? ` · אחרי כיווץ ${formatBytes(job.optimizedSize)}` : ""}
                </p>
                {job.error && <p className="mt-1 text-[10px] text-destructive">{job.error}</p>}
              </div>
              <span
                className={cn(
                  "shrink-0 font-bold",
                  job.stage === "נכשל"
                    ? "text-destructive"
                    : job.stage === "הושלם"
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                {job.stage}
              </span>
              {job.stage === "נכשל" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBatchUploading}
                  onClick={() => void uploadOne(job)}
                >
                  ניסיון נוסף
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {query.isPending ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : query.isError ? (
        <div className="flex items-center justify-between rounded-xl bg-destructive/10 p-3 text-xs">
          <span>המדיה אינה זמינה כרגע.</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="ml-1 h-3.5 w-3.5" />
            ניסיון נוסף
          </Button>
        </div>
      ) : records.length === 0 ? (
        <p className="rounded-xl bg-muted/25 p-4 text-center text-xs text-muted-foreground">
          עדיין לא פורסמו תמונות עבור {SUBJECT_LABELS[subject]}.
        </p>
      ) : (
        <div className="space-y-3">
          {records.map((record, index) => (
            <MediaEditor
              key={record.id}
              record={record}
              index={index}
              total={records.length}
              disabled={action.isPending}
              onMove={move}
              onSave={(caption, altText) =>
                action.mutate(() => updateAboutMedia({ data: { id: record.id, caption, altText } }))
              }
              onPrimary={() =>
                action.mutate(() => setPrimaryAboutMedia({ data: { id: record.id } }))
              }
              onReplace={() => {
                setReplaceId(record.id);
                replaceInput.current?.click();
              }}
              onDelete={() => {
                if (window.confirm("למחוק את התמונה לצמיתות? לא ניתן לבטל את הפעולה."))
                  action.mutate(() => deleteAboutMedia({ data: { id: record.id } }));
              }}
            />
          ))}
        </div>
      )}
      <input
        ref={replaceInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          void replaceFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </PremiumCard>
  );
}

function MediaEditor({
  record,
  index,
  total,
  disabled,
  onMove,
  onSave,
  onPrimary,
  onReplace,
  onDelete,
}: {
  record: AdminAboutMediaRecord;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onSave: (caption: string, altText: string) => void;
  onPrimary: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const [caption, setCaption] = useState(record.caption ?? "");
  const [altText, setAltText] = useState(record.alt_text ?? "");
  return (
    <article className="grid gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 sm:grid-cols-[8rem_1fr]">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {record.signedUrl && (
          <img
            src={record.signedUrl}
            alt={record.alt_text || SUBJECT_LABELS[record.subject]}
            className="h-full w-full object-cover"
          />
        )}
        {record.is_primary && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-1 text-[9px] font-bold text-primary-foreground">
            ראשית
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-2.5">
        <div>
          <Label htmlFor={`caption-${record.id}`} className="text-[10px]">
            כיתוב קצר
          </Label>
          <Input
            id={`caption-${record.id}`}
            maxLength={180}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`alt-${record.id}`} className="text-[10px]">
            טקסט חלופי לנגישות
          </Label>
          <Input
            id={`alt-${record.id}`}
            maxLength={180}
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onSave(caption, altText)}
          >
            <Check className="ml-1 h-3.5 w-3.5" />
            שמירה
          </Button>
          {!record.is_primary && (
            <Button size="sm" variant="outline" disabled={disabled} onClick={onPrimary}>
              <Star className="ml-1 h-3.5 w-3.5" />
              הגדר כראשית
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={disabled} onClick={onReplace}>
            החלפה
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || index === 0}
            aria-label="העבר תמונה למעלה"
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || index === total - 1}
            aria-label="העבר תמונה למטה"
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="ml-1 h-3.5 w-3.5" />
            מחיקה
          </Button>
        </div>
      </div>
    </article>
  );
}
