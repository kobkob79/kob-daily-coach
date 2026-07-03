/**
 * Data Export — lets the user export their KobiOS records by date range
 * and category, either as CSV, PDF, or via email (email is UI-ready and
 * enqueued for a future email backend).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Mail, FileText, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { fetchProfile } from "@/lib/profile";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

type CategoryKey =
  | "all"
  | "meals"
  | "water"
  | "weight"
  | "workouts"
  | "health"
  | "supplements"
  | "shifts"
  | "timeline"
  | "medical";

const CATEGORIES: { key: CategoryKey; labelKey: string }[] = [
  { key: "all", labelKey: "export.cat.all" },
  { key: "timeline", labelKey: "export.cat.timeline" },
  { key: "meals", labelKey: "export.cat.meals" },
  { key: "water", labelKey: "export.cat.water" },
  { key: "weight", labelKey: "export.cat.weight" },
  { key: "workouts", labelKey: "export.cat.workouts" },
  { key: "health", labelKey: "export.cat.health" },
  { key: "supplements", labelKey: "export.cat.supplements" },
  { key: "shifts", labelKey: "export.cat.shifts" },
  { key: "medical", labelKey: "export.cat.medical" },
];

interface Row {
  date: string;
  time: string;
  category: string;
  title: string;
  details: string;
}

async function collect(
  category: CategoryKey,
  from: string,
  to: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  const wants = (c: CategoryKey) => category === "all" || category === "timeline" || category === c;

  if (wants("meals")) {
    const { data } = await supabase
      .from("nutrition_entries")
      .select("date,meal_time,food_name,meal_type,calories,protein_g")
      .gte("date", from)
      .lte("date", to);
    for (const r of data ?? []) {
      rows.push({
        date: r.date ?? "",
        time: (r.meal_time ?? "").slice(0, 5),
        category: t("export.cat.meals"),
        title: r.food_name ?? r.meal_type ?? "—",
        details: `${Math.round(Number(r.calories ?? 0))} קק״ל · ${Math.round(Number(r.protein_g ?? 0))}g חלבון`,
      });
    }
  }

  const eventKinds: Record<string, CategoryKey> = {
    water: "water",
    supplement: "supplements",
    weight: "weight",
    sleep: "health",
  };
  const { data: events } = await supabase
    .from("daily_events")
    .select("kind,event_date,event_time,amount,unit,label,emoji")
    .gte("event_date", from)
    .lte("event_date", to);
  for (const e of events ?? []) {
    const cat = eventKinds[e.kind as string];
    if (!cat || !wants(cat)) continue;
    rows.push({
      date: e.event_date ?? "",
      time: format(new Date(e.event_time), "HH:mm"),
      category: t(`export.cat.${cat}`),
      title: `${e.emoji ?? ""} ${e.label ?? e.kind}`.trim(),
      details: e.amount ? `${e.amount} ${e.unit ?? ""}`.trim() : "",
    });
  }

  if (wants("workouts")) {
    const { data } = await supabase
      .from("workouts")
      .select("date,name,duration_min,notes")
      .gte("date", from)
      .lte("date", to);
    for (const w of data ?? []) {
      rows.push({
        date: w.date ?? "",
        time: "",
        category: t("export.cat.workouts"),
        title: w.name ?? "אימון",
        details: `${w.duration_min ?? "—"} דק' ${w.notes ?? ""}`.trim(),
      });
    }
  }

  if (wants("health")) {
    const { data } = await supabase
      .from("health_logs")
      .select("date,area,pain_level,notes")
      .gte("date", from)
      .lte("date", to);
    for (const h of data ?? []) {
      rows.push({
        date: h.date ?? "",
        time: "",
        category: t("export.cat.health"),
        title: t(`health.area.${h.area}`),
        details: `כאב ${h.pain_level ?? "—"}/10 ${h.notes ?? ""}`.trim(),
      });
    }
  }

  if (wants("medical")) {
    const { data } = await supabase
      .from("vision_captures")
      .select("capture_type,created_at,extracted")
      .in("capture_type", ["medical_document", "blood_test", "medication"])
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`);
    for (const v of data ?? []) {
      const ex = (v.extracted ?? {}) as Record<string, unknown>;
      rows.push({
        date: v.created_at.slice(0, 10),
        time: v.created_at.slice(11, 16),
        category: t("export.cat.medical"),
        title: t(`capture.type.${v.capture_type}`),
        details: Object.values(ex).filter(Boolean).join(" · "),
      });
    }
  }

  return rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function toCsv(rows: Row[]): string {
  const header = ["תאריך", "שעה", "קטגוריה", "כותרת", "פרטים"];
  const esc = (v: string) => `"${(v ?? "").replaceAll('"', '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push([r.date, r.time, r.category, r.title, r.details].map(esc).join(","));
  }
  // BOM so Excel opens Hebrew correctly.
  return "\uFEFF" + lines.join("\n");
}

function downloadBlob(name: string, mime: string, content: BlobPart) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function makePdf(opts: {
  rows: Row[];
  from: string;
  to: string;
  category: string;
  profileName: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("KobiOS Report", 40, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Profile: ${opts.profileName}`, 40, 72);
  doc.text(`Range: ${opts.from}  -  ${opts.to}`, 40, 88);
  doc.text(`Category: ${opts.category}`, 40, 104);

  // Summary
  const totals: Record<string, number> = {};
  for (const r of opts.rows) totals[r.category] = (totals[r.category] ?? 0) + 1;
  let y = 128;
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 40, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  for (const [k, v] of Object.entries(totals)) {
    doc.text(`- ${k}: ${v}`, 50, y);
    y += 14;
  }

  autoTable(doc, {
    startY: y + 8,
    head: [["Date", "Time", "Category", "Title", "Details"]],
    body: opts.rows.map((r) => [r.date, r.time, r.category, r.title, r.details]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  return doc.output("blob");
}

function ExportPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(subDays(today, 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [category, setCategory] = useState<CategoryKey>("all");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"" | "csv" | "pdf" | "email">("");

  const currentCatLabel = t(
    CATEGORIES.find((c) => c.key === category)?.labelKey ?? "export.cat.all",
  );

  const run = async (mode: "csv" | "pdf" | "email") => {
    try {
      setBusy(mode);
      const rows = await collect(category, from, to);
      if (rows.length === 0) {
        toast.info(t("export.empty"));
        setBusy("");
        return;
      }
      const profile = await fetchProfile();
      const name = profile?.full_name || profile?.display_name || "KobiOS";
      const base = `kobios-${category}-${from}-${to}`;
      if (mode === "csv") {
        downloadBlob(`${base}.csv`, "text/csv;charset=utf-8", toCsv(rows));
        toast.success(t("export.csvReady"));
      } else if (mode === "pdf") {
        const blob = await makePdf({
          rows,
          from,
          to,
          category: currentCatLabel,
          profileName: name,
        });
        downloadBlob(`${base}.pdf`, "application/pdf", blob);
        toast.success(t("export.pdfReady"));
      } else {
        if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
          toast.error(t("export.emailInvalid"));
          setBusy("");
          return;
        }
        // Persist request for the future email backend.
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await supabase.from("daily_events").insert({
            user_id: u.user.id,
            kind: "supplement", // reuse generic events; label distinguishes
            event_date: format(new Date(), "yyyy-MM-dd"),
            biological_day: format(new Date(), "yyyy-MM-dd"),
            label: `export→${email} (${category} ${from}..${to})`,
            emoji: "📧",
          });
        }
        toast.success(t("export.emailQueued"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6 pb-2">
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          KobiOS
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">
          {t("export.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("export.subtitle")}</p>
      </section>

      <section>
        <SectionHeader title={t("export.range")} />
        <PremiumCard>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("export.from")}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("export.to")}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </PremiumCard>
      </section>

      <section>
        <SectionHeader title={t("export.category")} />
        <PremiumCard>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  category === c.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </PremiumCard>
      </section>

      <section>
        <SectionHeader title={t("export.actions")} />
        <PremiumCard className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => run("csv")}
              disabled={!!busy}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/50 px-3 py-3 text-sm font-medium transition hover:border-primary/60 active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {t("export.csv")}
            </button>
            <button
              onClick={() => run("pdf")}
              disabled={!!busy}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/50 px-3 py-3 text-sm font-medium transition hover:border-primary/60 active:scale-95 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {t("export.pdf")}
            </button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
            <label className="block text-xs text-muted-foreground">
              {t("export.emailTo")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              dir="ltr"
            />
            <button
              onClick={() => run("email")}
              disabled={!!busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {t("export.sendEmail")}
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("export.emailNote")}
            </p>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Download className="h-3 w-3" />
            {t("export.hint")}
          </p>
        </PremiumCard>
      </section>
    </div>
  );
}
