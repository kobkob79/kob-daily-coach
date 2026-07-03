/**
 * KobiOS Premium Health Book — replaces the old PDF export.
 *
 * The report is rendered as real HTML with an Assistant Hebrew font so
 * text shapes and RTL flow correctly. html2pdf.js (html2canvas + jsPDF)
 * then rasterises the DOM into a multi-page A4 PDF, which sidesteps
 * jsPDF's broken Hebrew glyph handling.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import html2pdf from "html2pdf.js";
import { Mail, FileText, FileSpreadsheet, Printer, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { fetchProfile } from "@/lib/profile";
import { t } from "@/lib/i18n";
import {
  analyseHealthBook,
  buildHealthBookHtml,
  collectHealthBookData,
  HEALTH_BOOK_CSS,
  type HealthBookData,
  type HealthBookAnalytics,
} from "@/lib/health-book";

export const Route = createFileRoute("/_authenticated/export")({
  component: HealthBookPage,
});

type CategoryKey = "all" | "core" | "medical";

const CATEGORIES: { key: CategoryKey; labelKey: string }[] = [
  { key: "all", labelKey: "hb.cat.all" },
  { key: "core", labelKey: "hb.cat.core" },
  { key: "medical", labelKey: "hb.cat.medical" },
];

/* -------------------- CSV export (kept for power users) -------------------- */

function toCsv(data: HealthBookData): string {
  const header = ["תאריך", "שעה", "סוג", "כותרת", "פרטים"];
  const esc = (v: string) => `"${(v ?? "").replaceAll('"', '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const r of data.timeline) {
    lines.push([r.date, r.time, r.icon, r.title, r.detail].map(esc).join(","));
  }
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

/* -------------------- Component -------------------- */

function HealthBookPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(subDays(today, 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [category, setCategory] = useState<CategoryKey>("all");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"" | "csv" | "pdf" | "print" | "email" | "preview">("");
  const [preview, setPreview] = useState<{
    data: HealthBookData;
    analytics: HealthBookAnalytics;
  } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const previewHtml = useMemo(() => {
    if (!preview) return "";
    return buildHealthBookHtml(preview.data, preview.analytics);
  }, [preview]);

  const build = async () => {
    const profile = await fetchProfile();
    const data = await collectHealthBookData({
      from,
      to,
      profile,
      avatarUrl: profile?.avatar_url ?? null,
    });
    // Category filter — trim sections that are not requested.
    if (category === "core") {
      data.medical = [];
    } else if (category === "medical") {
      data.workouts = data.workouts.map((w) => ({ ...w, minutes: 0, count: 0, names: [] }));
      data.favoriteMeals = [];
    }
    const analytics = analyseHealthBook(data);
    return { data, analytics };
  };

  const run = async (mode: "csv" | "pdf" | "print" | "email" | "preview") => {
    try {
      setBusy(mode);
      const built = await build();
      const empty =
        built.data.nutrition.every((n) => n.meals === 0) &&
        built.data.water.every((w) => w.ml === 0) &&
        built.data.workouts.every((w) => w.count === 0) &&
        built.data.pain.length === 0;
      if (empty && mode !== "preview") {
        toast.info(t("hb.empty"));
        setBusy("");
        return;
      }
      const base = `kobios-health-${built.data.from}_${built.data.to}`;

      if (mode === "csv") {
        downloadBlob(`${base}.csv`, "text/csv;charset=utf-8", toCsv(built.data));
        toast.success(t("hb.csvReady"));
        setBusy("");
        return;
      }

      // Everything else needs a rendered DOM. For PDF we render into a
      // sandboxed iframe with only HEALTH_BOOK_CSS so html2canvas never sees
      // the app's oklch/lab/lch color tokens (jsPDF cannot parse them).
      setPreview(built);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 60));
      const node = reportRef.current;
      if (!node && mode !== "pdf") {
        toast.error(t("hb.previewFailed"));
        setBusy("");
        return;
      }

      if (mode === "pdf") {
        // True isolation: render the report inside an iframe whose document
        // contains ONLY the PDF-safe stylesheet (hex/rgb only, Assistant
        // font). html2canvas reads computed styles from the element's
        // ownerDocument, so this guarantees it never sees the app's
        // oklch/lab/lch/color-mix tokens.
        const reportHtml = buildHealthBookHtml(built.data, built.analytics);
        const iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        iframe.style.cssText =
          "position:fixed;left:-99999px;top:0;width:820px;height:1200px;border:0;background:#ffffff;";
        document.body.appendChild(iframe);
        try {
          const doc = iframe.contentDocument;
          const win = iframe.contentWindow;
          if (!doc || !win) throw new Error("iframe unavailable");
          doc.open();
          doc.write(`<!doctype html><html lang="he" dir="rtl"><head>
            <meta charset="utf-8"/>
            <base href="${window.location.origin}/"/>
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@500;600;700;800&display=swap" rel="stylesheet">
            <style>
              html,body{margin:0;padding:0;background:#ffffff;color:#0f172a;font-family:"Assistant","Rubik","Heebo",system-ui,sans-serif;}
              ${HEALTH_BOOK_CSS}
            </style>
          </head><body>${reportHtml}</body></html>`);
          doc.close();
          const fontsReady = (doc as unknown as { fonts?: { ready?: Promise<unknown> } })
            .fonts?.ready;
          if (fontsReady) await fontsReady.catch(() => undefined);
          await new Promise((r) => setTimeout(r, 400));

          const target = doc.body.querySelector(".hb-book") ?? doc.body;
          await html2pdf()
            .from(target as HTMLElement)
            .set({
              margin: 0,
              filename: `${base}.pdf`,
              image: { type: "jpeg", quality: 0.96 },
              html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false,
                windowWidth: 820,
              },
              jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
              ...({ pagebreak: { mode: ["css", "legacy"] } } as Record<string, unknown>),
            })
            .save();
        } finally {
          iframe.remove();
        }
        toast.success(t("hb.pdfReady"));


      } else if (mode === "print") {
        const win = window.open("", "_blank", "noopener,noreferrer");
        if (!win) {
          toast.error(t("hb.printBlocked"));
          setBusy("");
          return;
        }
        win.document.write(`<!doctype html><html lang="he" dir="rtl"><head>
          <meta charset="utf-8"/>
          <title>${t("hb.title")}</title>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@500;600;700;800&display=swap" rel="stylesheet">
          <style>body{margin:0;background:#f5f7fb;}${HEALTH_BOOK_CSS}</style>
          </head><body>${node?.innerHTML ?? buildHealthBookHtml(built.data, built.analytics)}<script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
        win.document.close();
        toast.success(t("hb.printOpened"));
      } else if (mode === "email") {
        if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
          toast.error(t("hb.emailInvalid"));
          setBusy("");
          return;
        }
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await supabase.from("daily_events").insert({
            user_id: u.user.id,
            kind: "supplement",
            event_date: format(new Date(), "yyyy-MM-dd"),
            biological_day: format(new Date(), "yyyy-MM-dd"),
            label: `health-book→${email} (${from}..${to})`,
            emoji: "📧",
          });
        }
        toast.success(t("hb.emailQueued"));
      } else if (mode === "preview") {
        toast.success(t("hb.previewReady"));
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
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">KobiOS</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{t("hb.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("hb.subtitle")}</p>
      </section>

      <section>
        <SectionHeader title={t("hb.range")} />
        <PremiumCard>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("hb.from")}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t("hb.to")}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
                  (category === c.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground")
                }
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </PremiumCard>
      </section>

      <section>
        <SectionHeader title={t("hb.actions")} subtitle={t("hb.hebrewNote")} />
        <PremiumCard className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              onClick={() => run("pdf")}
              disabled={!!busy}
              busy={busy === "pdf"}
              icon={<FileText className="h-4 w-4" />}
              label={t("hb.pdf")}
              primary
            />
            <ActionButton
              onClick={() => run("print")}
              disabled={!!busy}
              busy={busy === "print"}
              icon={<Printer className="h-4 w-4" />}
              label={t("hb.print")}
            />
            <ActionButton
              onClick={() => run("preview")}
              disabled={!!busy}
              busy={busy === "preview"}
              icon={<Eye className="h-4 w-4" />}
              label={t("hb.preview")}
            />
            <ActionButton
              onClick={() => run("csv")}
              disabled={!!busy}
              busy={busy === "csv"}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              label={t("hb.csv")}
            />
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
            <label className="block text-xs text-muted-foreground">{t("hb.emailTo")}</label>
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
              {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {t("hb.sendEmail")}
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("hb.emailNote")}</p>
          </div>
        </PremiumCard>
      </section>

      {preview && (
        <section>
          <SectionHeader title={t("hb.previewTitle")} subtitle={t("hb.previewSub")} />
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-slate-100 p-2">
            <div
              className="hb-preview-scale origin-top mx-auto"
              style={{
                transform: "scale(0.42)",
                width: 794,
                transformOrigin: "top center",
                marginBottom: -1000,
              }}
            >
              <style>{HEALTH_BOOK_CSS}</style>
              <div ref={reportRef} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  busy,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50 " +
        (primary
          ? "bg-primary text-primary-foreground shadow-lg"
          : "border border-border/60 bg-background/50 hover:border-primary/60")
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
