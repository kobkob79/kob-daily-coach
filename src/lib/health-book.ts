/**
 * Health Book — data aggregation + premium HTML report builder.
 *
 * The report is rendered as pure HTML with an Assistant Hebrew font so
 * html2pdf.js (html2canvas + jsPDF) rasterises it with perfect RTL
 * shaping. This replaces the previous jsPDF text approach which mangled
 * Hebrew glyphs.
 */
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/profile";
import { getShiftForDate, type ShiftConfig } from "@/lib/shift";

/* -------------------- Types -------------------- */

export interface HealthBookInput {
  from: string; // yyyy-MM-dd
  to: string;
  profile: Profile | null;
  avatarUrl: string | null;
}

interface DayNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: number;
}

interface DayWater {
  date: string;
  ml: number;
}

interface DayWorkout {
  date: string;
  minutes: number;
  count: number;
  names: string[];
}

interface DayPain {
  date: string;
  area: string;
  level: number;
  notes: string | null;
}

export interface HealthBookData {
  from: string;
  to: string;
  profile: Profile | null;
  avatarDataUrl: string | null;
  days: string[];
  nutrition: DayNutrition[];
  water: DayWater[];
  workouts: DayWorkout[];
  pain: DayPain[];
  supplements: { date: string; label: string; time: string }[];
  weight: { date: string; kg: number }[];
  sleepHours: { date: string; hours: number }[];
  shifts: { date: string; kind: string }[];
  medical: { date: string; kind: string; summary: string }[];
  photos: { date: string; url: string; angle: string }[];
  favoriteMeals: { name: string; count: number; protein: number }[];
  timeline: { date: string; time: string; icon: string; title: string; detail: string }[];
}

/* -------------------- Helpers -------------------- */

async function fetchAvatarDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("profile-photos")
    .download(path);
  if (error || !data) return null;
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(data);
  });
}

async function fetchBodyPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("body-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

const SHIFT_HE: Record<string, string> = {
  day: "יום",
  night: "לילה",
  off: "חופש",
  half_rest: "מנוחה",
};

const AREA_HE: Record<string, string> = {
  neck: "צוואר",
  sciatica: "גב תחתון",
  ac_joint: "כתף",
};

/* -------------------- Data aggregation -------------------- */

export async function collectHealthBookData(input: HealthBookInput): Promise<HealthBookData> {
  const { from, to, profile, avatarUrl } = input;
  const days = eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((d) => format(d, "yyyy-MM-dd"));

  const [nut, events, workouts, health, medical, bodyPhotos, avatarData] = await Promise.all([
    supabase
      .from("nutrition_entries")
      .select("date,meal_time,food_name,meal_type,calories,protein_g,carbs_g,fat_g")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("daily_events")
      .select("kind,event_date,event_time,amount,unit,label,emoji")
      .gte("event_date", from)
      .lte("event_date", to),
    supabase
      .from("workouts")
      .select("date,name,duration_min,notes")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("health_logs")
      .select("date,area,pain_level,notes")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("vision_captures")
      .select("capture_type,created_at,extracted")
      .in("capture_type", ["medical_document", "blood_test", "medication"])
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("body_photos")
      .select("image_path,view_angle,taken_at")
      .gte("taken_at", `${from}T00:00:00`)
      .lte("taken_at", `${to}T23:59:59`)
      .order("taken_at", { ascending: false }),
    fetchAvatarDataUrl(avatarUrl ?? profile?.avatar_url ?? null),
  ]);

  // Nutrition per day + favorites
  const nutByDay = new Map<string, DayNutrition>();
  const favMap = new Map<string, { count: number; protein: number }>();
  for (const r of nut.data ?? []) {
    const d = r.date as string;
    const bucket =
      nutByDay.get(d) ??
      { date: d, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
    bucket.calories += Number(r.calories ?? 0);
    bucket.protein += Number(r.protein_g ?? 0);
    bucket.carbs += Number(r.carbs_g ?? 0);
    bucket.fat += Number(r.fat_g ?? 0);
    bucket.meals += 1;
    nutByDay.set(d, bucket);
    const name = (r.food_name ?? r.meal_type ?? "—") as string;
    const f = favMap.get(name) ?? { count: 0, protein: 0 };
    f.count += 1;
    f.protein += Number(r.protein_g ?? 0);
    favMap.set(name, f);
  }
  const nutrition = days.map(
    (d) =>
      nutByDay.get(d) ?? {
        date: d,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        meals: 0,
      },
  );

  // Water + weight + sleep + supplements from daily_events
  const waterByDay = new Map<string, number>();
  const weight: { date: string; kg: number }[] = [];
  const sleep: { date: string; hours: number }[] = [];
  const supplements: { date: string; label: string; time: string }[] = [];
  for (const e of events.data ?? []) {
    const d = e.event_date as string;
    if (e.kind === "water") {
      waterByDay.set(d, (waterByDay.get(d) ?? 0) + Number(e.amount ?? 0));
    } else if (e.kind === "weight") {
      weight.push({ date: d, kg: Number(e.amount ?? 0) });
    } else if (e.kind === "sleep") {
      sleep.push({ date: d, hours: Number(e.amount ?? 0) });
    } else if (e.kind === "supplement") {
      supplements.push({
        date: d,
        label: (e.label as string) ?? "תוסף",
        time: format(new Date(e.event_time as string), "HH:mm"),
      });
    }
  }
  const water = days.map((d) => ({ date: d, ml: waterByDay.get(d) ?? 0 }));

  // Workouts
  const workoutByDay = new Map<string, DayWorkout>();
  for (const w of workouts.data ?? []) {
    const d = w.date as string;
    const bucket =
      workoutByDay.get(d) ?? { date: d, minutes: 0, count: 0, names: [] };
    bucket.minutes += Number(w.duration_min ?? 0);
    bucket.count += 1;
    if (w.name) bucket.names.push(w.name as string);
    workoutByDay.set(d, bucket);
  }
  const workoutsOut = days.map(
    (d) => workoutByDay.get(d) ?? { date: d, minutes: 0, count: 0, names: [] },
  );

  // Pain
  const pain: DayPain[] = (health.data ?? []).map((h) => ({
    date: h.date as string,
    area: h.area as string,
    level: Number(h.pain_level ?? 0),
    notes: (h.notes as string) ?? null,
  }));

  // Medical
  const medicalOut = (medical.data ?? []).map((m) => {
    const ex = (m.extracted ?? {}) as Record<string, unknown>;
    return {
      date: (m.created_at as string).slice(0, 10),
      kind: m.capture_type as string,
      summary: Object.values(ex).filter(Boolean).join(" · ").slice(0, 200),
    };
  });

  // Shifts
  const { data: shiftCfg } = await supabase.from("shift_config").select("*").maybeSingle();
  const cfg: ShiftConfig | null = shiftCfg
    ? {
        anchor_date: shiftCfg.anchor_date as string,
        anchor_shift: shiftCfg.anchor_shift as "day" | "night",
        pattern: (shiftCfg.pattern as string) ?? "intel_9d",
      }
    : null;
  const shifts = days.map((d) => ({
    date: d,
    kind: cfg ? getShiftForDate(cfg, parseISO(d)) : "off",
  }));

  // Body photos (resolve signed URLs)
  const photos = await Promise.all(
    (bodyPhotos.data ?? []).slice(0, 8).map(async (p) => ({
      date: (p.taken_at as string).slice(0, 10),
      angle: p.view_angle as string,
      url: (await fetchBodyPhotoUrl(p.image_path as string)) ?? "",
    })),
  );

  // Favorite meals
  const favoriteMeals = [...favMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, v]) => ({
      name,
      count: v.count,
      protein: Math.round(v.protein / Math.max(1, v.count)),
    }));

  // Timeline (compact chronological list)
  const timeline: HealthBookData["timeline"] = [];
  for (const r of nut.data ?? []) {
    timeline.push({
      date: r.date as string,
      time: ((r.meal_time as string) ?? "").slice(0, 5),
      icon: "🍽️",
      title: (r.food_name as string) ?? (r.meal_type as string) ?? "ארוחה",
      detail: `${Math.round(Number(r.calories ?? 0))} קק״ל · ${Math.round(Number(r.protein_g ?? 0))}g חלבון`,
    });
  }
  for (const e of events.data ?? []) {
    const icon =
      e.kind === "water" ? "💧" : e.kind === "weight" ? "⚖️" : e.kind === "sleep" ? "😴" : e.kind === "supplement" ? "💊" : "•";
    timeline.push({
      date: e.event_date as string,
      time: format(new Date(e.event_time as string), "HH:mm"),
      icon: (e.emoji as string) || icon,
      title: (e.label as string) ?? (e.kind as string),
      detail: e.amount ? `${e.amount} ${e.unit ?? ""}`.trim() : "",
    });
  }
  for (const w of workouts.data ?? []) {
    timeline.push({
      date: w.date as string,
      time: "",
      icon: "🏋️",
      title: (w.name as string) ?? "אימון",
      detail: `${w.duration_min ?? "—"} דק'`,
    });
  }
  for (const h of health.data ?? []) {
    timeline.push({
      date: h.date as string,
      time: "",
      icon: "🩺",
      title: AREA_HE[h.area as string] ?? (h.area as string),
      detail: `כאב ${h.pain_level ?? "—"}/10`,
    });
  }
  timeline.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return {
    from,
    to,
    profile,
    avatarDataUrl: avatarData,
    days,
    nutrition,
    water,
    workouts: workoutsOut,
    pain,
    supplements,
    weight,
    sleepHours: sleep,
    shifts,
    medical: medicalOut,
    photos,
    favoriteMeals,
    timeline: timeline.slice(0, 120),
  };
}

/* -------------------- Analytics -------------------- */

const avg = (arr: number[]) =>
  arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

export interface HealthBookAnalytics {
  avgKcal: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  proteinGoalDays: number;
  bestProteinDay: DayNutrition | null;
  worstProteinDay: DayNutrition | null;
  avgWater: number;
  waterGoalDays: number;
  bestWaterDay: DayWater | null;
  workoutCount: number;
  workoutMinutes: number;
  workoutDays: number;
  favoriteExercises: { name: string; count: number }[];
  currentWeight: number | null;
  weightDelta: number | null;
  bmi: number | null;
  avgSleep: number;
  painByArea: { area: string; avg: number; days: number }[];
  proteinWorkVsOff: { work: number; off: number };
  waterWorkVsOff: { work: number; off: number };
  insights: string[];
  recommendations: { title: string; reason: string }[];
  goals: string[];
}

export function analyseHealthBook(data: HealthBookData): HealthBookAnalytics {
  const proteinTarget = data.profile?.protein_target_g ?? 150;
  const waterTarget = data.profile?.water_target_ml ?? 3000;

  const avgKcal = Math.round(avg(data.nutrition.map((n) => n.calories)));
  const avgProtein = Math.round(avg(data.nutrition.map((n) => n.protein)));
  const avgCarbs = Math.round(avg(data.nutrition.map((n) => n.carbs)));
  const avgFat = Math.round(avg(data.nutrition.map((n) => n.fat)));
  const proteinGoalDays = data.nutrition.filter((n) => n.protein >= proteinTarget).length;

  const trackedProtein = data.nutrition.filter((n) => n.protein > 0);
  const bestProteinDay =
    trackedProtein.slice().sort((a, b) => b.protein - a.protein)[0] ?? null;
  const worstProteinDay =
    trackedProtein.slice().sort((a, b) => a.protein - b.protein)[0] ?? null;

  const avgWater = Math.round(avg(data.water.map((w) => w.ml)));
  const waterGoalDays = data.water.filter((w) => w.ml >= waterTarget).length;
  const bestWaterDay = data.water.slice().sort((a, b) => b.ml - a.ml)[0] ?? null;

  const workoutCount = data.workouts.reduce((s, w) => s + w.count, 0);
  const workoutMinutes = data.workouts.reduce((s, w) => s + w.minutes, 0);
  const workoutDays = data.workouts.filter((w) => w.count > 0).length;
  const nameCount = new Map<string, number>();
  for (const w of data.workouts) for (const n of w.names) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  const favoriteExercises = [...nameCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const currentWeight =
    data.weight.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.kg ??
    data.profile?.current_weight_kg ??
    null;
  const firstWeight = data.weight.slice().sort((a, b) => a.date.localeCompare(b.date))[0]?.kg ?? null;
  const weightDelta =
    currentWeight != null && firstWeight != null
      ? Math.round((currentWeight - firstWeight) * 10) / 10
      : null;
  const bmi =
    currentWeight && data.profile?.height_cm
      ? Math.round((currentWeight / Math.pow(data.profile.height_cm / 100, 2)) * 10) / 10
      : null;

  const avgSleep = Math.round(avg(data.sleepHours.map((s) => s.hours)) * 10) / 10;

  const areaBuckets = new Map<string, number[]>();
  for (const p of data.pain) {
    const b = areaBuckets.get(p.area) ?? [];
    b.push(p.level);
    areaBuckets.set(p.area, b);
  }
  const painByArea = [...areaBuckets.entries()].map(([area, levels]) => ({
    area,
    avg: Math.round(avg(levels) * 10) / 10,
    days: levels.length,
  }));

  // Shift crosscut
  const isWork = (kind: string) => kind === "day" || kind === "night";
  const workDays = new Set(data.shifts.filter((s) => isWork(s.kind)).map((s) => s.date));
  const offDays = new Set(data.shifts.filter((s) => !isWork(s.kind)).map((s) => s.date));
  const proteinWork = avg(data.nutrition.filter((n) => workDays.has(n.date)).map((n) => n.protein));
  const proteinOff = avg(data.nutrition.filter((n) => offDays.has(n.date)).map((n) => n.protein));
  const waterWork = avg(data.water.filter((w) => workDays.has(w.date)).map((w) => w.ml));
  const waterOff = avg(data.water.filter((w) => offDays.has(w.date)).map((w) => w.ml));

  const insights: string[] = [];
  if (proteinGoalDays > 0)
    insights.push(`עמדת ביעד החלבון ב־${proteinGoalDays} ימים מתוך ${data.nutrition.length}.`);
  if (avgProtein < proteinTarget * 0.85)
    insights.push(`ממוצע החלבון (${avgProtein}g) נמוך מהיעד (${proteinTarget}g).`);
  else insights.push(`ממוצע חלבון יפה: ${avgProtein}g ליום.`);
  if (avgWater >= waterTarget * 0.9) insights.push(`הידרציה מצוינת — ${(avgWater / 1000).toFixed(1)} ליטר ביום.`);
  else insights.push(`הידרציה ממוצעת ${(avgWater / 1000).toFixed(1)} ליטר — יעד ${(waterTarget / 1000).toFixed(1)}.`);
  if (workoutDays > 0) insights.push(`התאמנת ב־${workoutDays} ימים (${workoutMinutes} דקות סה״כ).`);
  if (weightDelta != null && Math.abs(weightDelta) >= 0.3)
    insights.push(`המשקל ${weightDelta > 0 ? "עלה" : "ירד"} ב־${Math.abs(weightDelta)} ק״ג בטווח.`);
  if (avgSleep > 0 && avgSleep < 6.5) insights.push(`ממוצע שינה ${avgSleep} שעות — נמוך מהמומלץ.`);
  if (proteinWork && proteinOff && proteinOff - proteinWork > 15)
    insights.push(`חלבון בימי חופש (${Math.round(proteinOff)}g) גבוה מימי משמרת (${Math.round(proteinWork)}g).`);
  if (waterWork && waterOff && waterOff - waterWork > 400)
    insights.push(`שתיית המים יורדת בימי משמרת (${Math.round(waterWork)}ml מול ${Math.round(waterOff)}ml).`);
  for (const p of painByArea)
    if (p.avg > 4) insights.push(`רמת הכאב ב${AREA_HE[p.area] ?? p.area} גבוהה (${p.avg}/10).`);

  const recommendations: { title: string; reason: string }[] = [];
  if (avgProtein < proteinTarget)
    recommendations.push({
      title: `הוסף כ־${Math.max(10, Math.round(proteinTarget - avgProtein))}g חלבון ליום`,
      reason: `הממוצע הנוכחי ${avgProtein}g והיעד ${proteinTarget}g. פתרון קל: קוטג' 5% או שייק חלבון.`,
    });
  if (waterWork && waterOff - waterWork > 300)
    recommendations.push({
      title: "הוסף 400ml בימי משמרת",
      reason: "זוהתה נפילה של שתייה בימי עבודה מול ימי חופש.",
    });
  if (avgSleep > 0 && avgSleep < 7)
    recommendations.push({
      title: "התכוונן ל־30 דק' שינה נוספות לפני משמרת לילה",
      reason: `ממוצע השינה בטווח הוא ${avgSleep} שעות בלבד.`,
    });
  if (workoutDays < Math.floor(data.days.length / 3))
    recommendations.push({
      title: "כוון ל־3 אימונים בשבוע",
      reason: `בטווח הזה התאמנת ב־${workoutDays} ימים בלבד מתוך ${data.days.length}.`,
    });
  if (painByArea.some((p) => p.area === "neck" && p.avg > 4))
    recommendations.push({
      title: "בצע מתיחות צוואר יומיות",
      reason: "ממוצע כאב הצוואר בטווח גבוה מ־4/10.",
    });
  if (recommendations.length === 0)
    recommendations.push({
      title: "המשך את הקו הנוכחי",
      reason: "המדדים בטווח הבריא — התמד באותם הרגלים בתקופה הבאה.",
    });

  const goals: string[] = [
    `שמור על ${Math.max(proteinTarget, avgProtein)}g חלבון ביום ולפחות ${Math.max(5, workoutDays)} אימונים בתקופה הבאה.`,
    `הגע ל־${(Math.max(waterTarget, avgWater) / 1000).toFixed(1)} ליטר מים ביום, במיוחד בימי משמרת.`,
    "רשום שינה כל ערב ונסה 7+ שעות בלילות שלפני משמרת.",
  ];

  return {
    avgKcal,
    avgProtein,
    avgCarbs,
    avgFat,
    proteinGoalDays,
    bestProteinDay,
    worstProteinDay,
    avgWater,
    waterGoalDays,
    bestWaterDay,
    workoutCount,
    workoutMinutes,
    workoutDays,
    favoriteExercises,
    currentWeight,
    weightDelta,
    bmi,
    avgSleep,
    painByArea,
    proteinWorkVsOff: { work: Math.round(proteinWork), off: Math.round(proteinOff) },
    waterWorkVsOff: { work: Math.round(waterWork), off: Math.round(waterOff) },
    insights,
    recommendations,
    goals,
  };
}

/* -------------------- SVG chart primitives -------------------- */

function sparklinePath(values: number[], width: number, height: number, pad = 4) {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const step = (width - pad * 2) / Math.max(1, values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function barsSvg(values: number[], color: string, target?: number) {
  const w = 560;
  const h = 90;
  const pad = 4;
  const max = Math.max(...values, target ?? 0, 1);
  const barW = (w - pad * 2) / Math.max(1, values.length);
  const bars = values
    .map((v, i) => {
      const bh = ((v / max) * (h - pad * 2));
      const x = pad + i * barW + 1;
      const y = h - pad - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${color}" opacity="0.85"/>`;
    })
    .join("");
  const targetLine =
    target != null
      ? `<line x1="${pad}" x2="${w - pad}" y1="${h - pad - (target / max) * (h - pad * 2)}" y2="${h - pad - (target / max) * (h - pad * 2)}" stroke="#94a3b8" stroke-dasharray="3,3" stroke-width="1"/>`
      : "";
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${h}px;">${bars}${targetLine}</svg>`;
}

function lineSvg(values: number[], color: string) {
  const w = 560;
  const h = 90;
  const path = sparklinePath(values, w, h);
  const area = `${path} L ${w - 4},${h - 4} L 4,${h - 4} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${h}px;">
    <path d="${area}" fill="${color}" fill-opacity="0.12"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/* -------------------- HTML report -------------------- */

const fmtDate = (d: string) => format(parseISO(d), "d/M");
const fmtLong = (d: string) => format(parseISO(d), "d.M.yyyy");

function coverPage(data: HealthBookData) {
  const name =
    data.profile?.full_name?.trim() || data.profile?.display_name?.trim() || "המשתמש";
  const generated = format(new Date(), "d.M.yyyy");
  const avatar = data.avatarDataUrl
    ? `<img src="${data.avatarDataUrl}" alt="" style="width:112px;height:112px;border-radius:56px;object-fit:cover;border:3px solid rgba(255,255,255,0.35);box-shadow:0 12px 40px rgba(0,0,0,0.35);"/>`
    : `<div style="width:112px;height:112px;border-radius:56px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:#fff;">${(name[0] ?? "K").toUpperCase()}</div>`;
  return `
  <section class="hb-page hb-cover">
    <div class="hb-cover-glow" aria-hidden></div>
    <div class="hb-cover-inner">
      <div class="hb-brand">
        <div class="hb-logo"></div>
        <div class="hb-brand-text">Kobi<span>OS</span></div>
      </div>
      <div class="hb-cover-body">
        <p class="hb-eyebrow">דו״ח בריאות אישי</p>
        <h1 class="hb-title">הספר הרפואי שלי</h1>
        <p class="hb-cover-sub">אוסף המדדים, ההרגלים והתובנות שלך —<br/>מעוצב כמו יומן פרימיום שאפשר להראות לרופא, לתזונאי ולמאמן.</p>
        <div class="hb-user">
          ${avatar}
          <div>
            <div class="hb-user-name">${name}</div>
            <div class="hb-user-range">${fmtLong(data.from)} – ${fmtLong(data.to)}</div>
          </div>
        </div>
      </div>
      <div class="hb-cover-footer">
        <div>הופק ב־${generated}</div>
        <div>KobiOS · מרכז השליטה האישי שלך</div>
      </div>
    </div>
  </section>`;
}

function summaryCard(icon: string, label: string, value: string, sub: string, tint: string) {
  return `<div class="hb-metric" style="--tint:${tint}">
    <div class="hb-metric-icon">${icon}</div>
    <div class="hb-metric-label">${label}</div>
    <div class="hb-metric-value">${value}</div>
    <div class="hb-metric-sub">${sub}</div>
  </div>`;
}

function summaryPage(data: HealthBookData, a: HealthBookAnalytics) {
  const proteinTarget = data.profile?.protein_target_g ?? 150;
  const waterTarget = data.profile?.water_target_ml ?? 3000;
  const supplementsCount = data.supplements.length;
  const painCount = data.pain.length;
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">סיכום מנהלים</p>
        <h2 class="hb-h2">התקופה במבט אחד</h2>
      </div>
      <div class="hb-page-num">02</div>
    </header>
    <div class="hb-grid">
      ${summaryCard("💧", "מים ליום", `${(a.avgWater / 1000).toFixed(1)}L`, `יעד ${(waterTarget / 1000).toFixed(1)}L · ${a.waterGoalDays} ימי יעד`, "#38bdf8")}
      ${summaryCard("🥩", "חלבון ליום", `${a.avgProtein}g`, `יעד ${proteinTarget}g · ${a.proteinGoalDays} ימי יעד`, "#f97316")}
      ${summaryCard("⚖️", "משקל", a.currentWeight != null ? `${a.currentWeight}kg` : "—", a.weightDelta != null ? `${a.weightDelta > 0 ? "+" : ""}${a.weightDelta}kg בטווח` : "אין מדידה", "#a855f7")}
      ${summaryCard("🏋", "אימונים", `${a.workoutCount}`, `${a.workoutMinutes} דק׳ · ${a.workoutDays} ימים`, "#22c55e")}
      ${summaryCard("😴", "שינה", a.avgSleep ? `${a.avgSleep}h` : "—", `${data.sleepHours.length} רישומים`, "#6366f1")}
      ${summaryCard("💊", "תוספים", `${supplementsCount}`, "לקיחות בטווח", "#eab308")}
      ${summaryCard("🩺", "בריאות", `${painCount}`, "רישומי כאב בטווח", "#ef4444")}
      ${summaryCard("🍽️", "ארוחות", `${data.nutrition.reduce((s, n) => s + n.meals, 0)}`, `${a.avgKcal} קק״ל בממוצע`, "#f43f5e")}
    </div>
  </section>`;
}

function nutritionPage(data: HealthBookData, a: HealthBookAnalytics) {
  const proteinTarget = data.profile?.protein_target_g ?? 150;
  const proteinChart = barsSvg(data.nutrition.map((n) => Math.round(n.protein)), "#f97316", proteinTarget);
  const kcalChart = lineSvg(data.nutrition.map((n) => Math.round(n.calories)), "#f43f5e");
  const favs = a.favoriteExercises;
  const favMeals = data.favoriteMeals
    .map((f) => `<li><span>${f.name}</span><span class="hb-muted">${f.count}× · ${f.protein}g</span></li>`)
    .join("");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">תזונה</p>
        <h2 class="hb-h2">הצלחת שלך בטווח</h2>
      </div>
      <div class="hb-page-num">03</div>
    </header>
    <div class="hb-two-col">
      <div class="hb-card">
        <div class="hb-card-title">חלבון יומי (גרם)</div>
        ${proteinChart}
        <div class="hb-legend"><span class="hb-dot" style="background:#f97316"></span>יומי<span class="hb-dot" style="background:#94a3b8;margin-inline-start:16px"></span>יעד</div>
      </div>
      <div class="hb-card">
        <div class="hb-card-title">קלוריות יומיות</div>
        ${kcalChart}
        <div class="hb-muted" style="margin-top:6px">ממוצע ${a.avgKcal} קק״ל · ${a.avgCarbs}g פחמימות · ${a.avgFat}g שומן</div>
      </div>
    </div>
    <div class="hb-two-col">
      <div class="hb-card">
        <div class="hb-card-title">שיאים אישיים</div>
        <ul class="hb-list">
          <li><span>יום החלבון הגבוה</span><span class="hb-muted">${a.bestProteinDay ? `${Math.round(a.bestProteinDay.protein)}g · ${fmtLong(a.bestProteinDay.date)}` : "—"}</span></li>
          <li><span>יום החלבון הנמוך</span><span class="hb-muted">${a.worstProteinDay ? `${Math.round(a.worstProteinDay.protein)}g · ${fmtLong(a.worstProteinDay.date)}` : "—"}</span></li>
          <li><span>ימי יעד חלבון</span><span class="hb-muted">${a.proteinGoalDays} מתוך ${data.nutrition.length}</span></li>
          <li><span>ממוצע ארוחות ליום</span><span class="hb-muted">${(data.nutrition.reduce((s, n) => s + n.meals, 0) / Math.max(1, data.nutrition.length)).toFixed(1)}</span></li>
        </ul>
      </div>
      <div class="hb-card">
        <div class="hb-card-title">מאכלים חוזרים</div>
        <ul class="hb-list">${favMeals || `<li class="hb-muted">אין מספיק נתונים בטווח</li>`}</ul>
        ${favs.length ? `<div class="hb-card-title" style="margin-top:14px">תרגילים אהובים</div><ul class="hb-list">${favs.map((f) => `<li><span>${f.name}</span><span class="hb-muted">${f.count}×</span></li>`).join("")}</ul>` : ""}
      </div>
    </div>
  </section>`;
}

function hydrationPage(data: HealthBookData, a: HealthBookAnalytics) {
  const waterTarget = data.profile?.water_target_ml ?? 3000;
  const chart = barsSvg(data.water.map((w) => w.ml), "#38bdf8", waterTarget);
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">הידרציה</p>
        <h2 class="hb-h2">שתייה יומית</h2>
      </div>
      <div class="hb-page-num">04</div>
    </header>
    <div class="hb-card">
      <div class="hb-card-title">מ״ל לפי יום</div>
      ${chart}
      <div class="hb-legend"><span class="hb-dot" style="background:#38bdf8"></span>שתייה בפועל<span class="hb-dot" style="background:#94a3b8;margin-inline-start:16px"></span>יעד</div>
    </div>
    <div class="hb-two-col">
      <div class="hb-card"><div class="hb-card-title">ממוצע</div><div class="hb-big">${(a.avgWater / 1000).toFixed(2)}L</div><div class="hb-muted">יעד ${(waterTarget / 1000).toFixed(1)}L</div></div>
      <div class="hb-card"><div class="hb-card-title">היום הטוב ביותר</div><div class="hb-big">${a.bestWaterDay ? `${(a.bestWaterDay.ml / 1000).toFixed(2)}L` : "—"}</div><div class="hb-muted">${a.bestWaterDay ? fmtLong(a.bestWaterDay.date) : ""}</div></div>
    </div>
  </section>`;
}

function workoutPage(data: HealthBookData, a: HealthBookAnalytics) {
  const chart = barsSvg(data.workouts.map((w) => w.minutes), "#22c55e");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">אימונים</p>
        <h2 class="hb-h2">עקביות ותנועה</h2>
      </div>
      <div class="hb-page-num">05</div>
    </header>
    <div class="hb-card">
      <div class="hb-card-title">דקות אימון לפי יום</div>
      ${chart}
    </div>
    <div class="hb-grid">
      ${summaryCard("🔥", "אימונים", `${a.workoutCount}`, `${a.workoutMinutes} דק'`, "#22c55e")}
      ${summaryCard("📅", "עקביות", `${a.workoutDays}/${data.days.length}`, "ימי אימון", "#10b981")}
      ${summaryCard("⭐", "מועדפים", `${a.favoriteExercises[0]?.name ?? "—"}`, `${a.favoriteExercises[0]?.count ?? 0} פעמים`, "#84cc16")}
    </div>
  </section>`;
}

function healthPage(data: HealthBookData, a: HealthBookAnalytics) {
  const meds = data.medical
    .slice(0, 8)
    .map((m) => `<li><span>${fmtLong(m.date)} · ${m.kind}</span><span class="hb-muted">${m.summary || "—"}</span></li>`)
    .join("");
  const supp = data.supplements
    .slice(0, 10)
    .map((s) => `<li><span>${s.label}</span><span class="hb-muted">${fmtLong(s.date)} · ${s.time}</span></li>`)
    .join("");
  const painRows = a.painByArea
    .map((p) => `<li><span>${AREA_HE[p.area] ?? p.area}</span><span class="hb-muted">ממוצע ${p.avg}/10 · ${p.days} רישומים</span></li>`)
    .join("");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">בריאות ורפואה</p>
        <h2 class="hb-h2">מדדים ומסמכים</h2>
      </div>
      <div class="hb-page-num">06</div>
    </header>
    <div class="hb-two-col">
      <div class="hb-card"><div class="hb-card-title">כאב לפי אזור</div><ul class="hb-list">${painRows || `<li class="hb-muted">אין רישומי כאב בטווח</li>`}</ul></div>
      <div class="hb-card"><div class="hb-card-title">תוספים ותרופות</div><ul class="hb-list">${supp || `<li class="hb-muted">אין תיעוד בטווח</li>`}</ul></div>
    </div>
    <div class="hb-card"><div class="hb-card-title">מסמכים רפואיים</div><ul class="hb-list">${meds || `<li class="hb-muted">אין מסמכים בטווח</li>`}</ul></div>
  </section>`;
}

function shiftPage(data: HealthBookData, a: HealthBookAnalytics) {
  const counts = data.shifts.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const kinds = ["day", "night", "off", "half_rest"];
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">משמרות</p>
        <h2 class="hb-h2">איך המחזור משפיע עליך</h2>
      </div>
      <div class="hb-page-num">07</div>
    </header>
    <div class="hb-grid">
      ${kinds
        .map(
          (k) =>
            `<div class="hb-metric" style="--tint:#64748b"><div class="hb-metric-icon">${k === "day" ? "☀️" : k === "night" ? "🌙" : k === "off" ? "🏖️" : "🛌"}</div><div class="hb-metric-label">${SHIFT_HE[k]}</div><div class="hb-metric-value">${counts[k] ?? 0}</div><div class="hb-metric-sub">ימים</div></div>`,
        )
        .join("")}
    </div>
    <div class="hb-two-col">
      <div class="hb-card"><div class="hb-card-title">חלבון: משמרת מול חופש</div><div class="hb-big">${a.proteinWorkVsOff.work}g <span class="hb-muted" style="font-size:14px">משמרת</span></div><div class="hb-big">${a.proteinWorkVsOff.off}g <span class="hb-muted" style="font-size:14px">חופש</span></div></div>
      <div class="hb-card"><div class="hb-card-title">מים: משמרת מול חופש</div><div class="hb-big">${a.waterWorkVsOff.work}ml <span class="hb-muted" style="font-size:14px">משמרת</span></div><div class="hb-big">${a.waterWorkVsOff.off}ml <span class="hb-muted" style="font-size:14px">חופש</span></div></div>
    </div>
  </section>`;
}

function timelinePage(data: HealthBookData) {
  const grouped = new Map<string, HealthBookData["timeline"]>();
  for (const t of data.timeline) {
    const arr = grouped.get(t.date) ?? [];
    arr.push(t);
    grouped.set(t.date, arr);
  }
  const blocks = [...grouped.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(
      ([date, items]) => `
        <div class="hb-day">
          <div class="hb-day-head">${fmtLong(date)}</div>
          <ul class="hb-timeline">
            ${items
              .map(
                (i) => `<li><span class="hb-t-icon">${i.icon}</span><div><div class="hb-t-title">${i.title}</div><div class="hb-muted">${i.time ? i.time + " · " : ""}${i.detail}</div></div></li>`,
              )
              .join("")}
          </ul>
        </div>`,
    )
    .join("");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">ציר זמן</p>
        <h2 class="hb-h2">הימים שלך, לפי סדר</h2>
      </div>
      <div class="hb-page-num">08</div>
    </header>
    ${blocks || `<div class="hb-card hb-muted">אין נתונים בטווח.</div>`}
  </section>`;
}

function aiPage(a: HealthBookAnalytics) {
  const insights = a.insights.map((i) => `<li>${i}</li>`).join("");
  const recs = a.recommendations
    .map(
      (r) => `<li><div class="hb-rec-title">${r.title}</div><div class="hb-muted">למה: ${r.reason}</div></li>`,
    )
    .join("");
  const goals = a.goals.map((g) => `<li>${g}</li>`).join("");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">הניתוח של KobiOS</p>
        <h2 class="hb-h2">מה למדנו עליך</h2>
      </div>
      <div class="hb-page-num">09</div>
    </header>
    <div class="hb-card"><div class="hb-card-title">תובנות עיקריות</div><ul class="hb-bullets">${insights || `<li class="hb-muted">עוד לא הצטברו מספיק נתונים לניתוח.</li>`}</ul></div>
    <div class="hb-card"><div class="hb-card-title">המלצות אישיות</div><ul class="hb-recs">${recs}</ul></div>
    <div class="hb-card"><div class="hb-card-title">יעדים לתקופה הבאה</div><ul class="hb-bullets">${goals}</ul></div>
  </section>`;
}

function photosPage(data: HealthBookData) {
  if (data.photos.length === 0) return "";
  const items = data.photos
    .filter((p) => p.url)
    .map(
      (p) => `<div class="hb-photo"><img crossorigin="anonymous" src="${p.url}" alt=""/><div class="hb-muted" style="margin-top:6px">${fmtLong(p.date)} · ${p.angle}</div></div>`,
    )
    .join("");
  return `
  <section class="hb-page">
    <header class="hb-page-header">
      <div>
        <p class="hb-eyebrow-dark">גלריית התקדמות</p>
        <h2 class="hb-h2">תמונות גוף</h2>
      </div>
      <div class="hb-page-num">10</div>
    </header>
    <div class="hb-photos">${items}</div>
  </section>`;
}

/* -------------------- Full HTML shell -------------------- */

export function buildHealthBookHtml(data: HealthBookData, analytics: HealthBookAnalytics): string {
  return `
  <div class="hb-book" dir="rtl" lang="he">
    ${coverPage(data)}
    ${summaryPage(data, analytics)}
    ${nutritionPage(data, analytics)}
    ${hydrationPage(data, analytics)}
    ${workoutPage(data, analytics)}
    ${healthPage(data, analytics)}
    ${shiftPage(data, analytics)}
    ${timelinePage(data)}
    ${aiPage(analytics)}
    ${photosPage(data)}
  </div>`;
}

/**
 * Inline stylesheet — kept close to the builder so html2pdf can rasterise
 * a self-contained node without depending on the app's Tailwind utilities.
 */
export const HEALTH_BOOK_CSS = `
.hb-book { font-family: "Assistant", "Rubik", "Heebo", system-ui, sans-serif; color: #0f172a; background:#f5f7fb; }
.hb-book * { box-sizing: border-box; }
.hb-page { width: 794px; min-height: 1123px; padding: 56px 56px 72px; background: #ffffff; margin: 0 auto 24px; border-radius: 18px; box-shadow: 0 24px 60px -30px rgba(15,23,42,0.25); position: relative; overflow: hidden; page-break-after: always; }
.hb-page:last-child { page-break-after: auto; }
.hb-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 28px; }
.hb-page-num { font-size:13px; font-weight:700; color:#94a3b8; letter-spacing:0.2em; }
.hb-eyebrow-dark { font-size:11px; letter-spacing:0.3em; text-transform:uppercase; color:#64748b; margin:0 0 6px; font-weight:600; }
.hb-h2 { font-size:30px; font-weight:800; margin:0; letter-spacing:-0.01em; }
.hb-muted { color:#64748b; font-size:13px; }
.hb-big { font-size:34px; font-weight:800; letter-spacing:-0.01em; margin-top:4px; }

.hb-cover { background: linear-gradient(140deg, #0f172a 0%, #1e293b 55%, #0b1120 100%); color:#f8fafc; padding: 0; }
.hb-cover-glow { position:absolute; inset:-20% -20% auto -20%; height:60%; background: radial-gradient(closest-side, rgba(56,189,248,0.35), transparent 70%); filter: blur(20px); }
.hb-cover-inner { position:relative; height:1123px; padding:64px 64px 56px; display:flex; flex-direction:column; }
.hb-brand { display:flex; align-items:center; gap:14px; }
.hb-logo { width:44px; height:44px; border-radius:14px; background: linear-gradient(135deg,#38bdf8,#6366f1); box-shadow:0 12px 32px -8px rgba(99,102,241,0.6); }
.hb-brand-text { font-size:22px; font-weight:800; letter-spacing:-0.01em; }
.hb-brand-text span { background: linear-gradient(90deg,#38bdf8,#a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hb-cover-body { flex:1; display:flex; flex-direction:column; justify-content:center; gap:28px; }
.hb-eyebrow { font-size:13px; letter-spacing:0.4em; text-transform:uppercase; color:#94a3b8; }
.hb-title { font-size:64px; font-weight:800; margin:0; letter-spacing:-0.02em; line-height:1.05; }
.hb-cover-sub { font-size:18px; line-height:1.6; color:#cbd5e1; max-width:520px; }
.hb-user { display:flex; align-items:center; gap:18px; margin-top:24px; }
.hb-user-name { font-size:24px; font-weight:700; }
.hb-user-range { font-size:14px; color:#94a3b8; margin-top:4px; }
.hb-cover-footer { display:flex; justify-content:space-between; font-size:12px; color:#94a3b8; letter-spacing:0.1em; }

.hb-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; margin-bottom:22px; }
.hb-metric { background: #f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:16px; position:relative; overflow:hidden; }
.hb-metric::before { content:""; position:absolute; inset:auto -30% -60% auto; width:120px; height:120px; border-radius:60px; background: var(--tint); opacity:0.14; }
.hb-metric-icon { font-size:20px; }
.hb-metric-label { font-size:12px; color:#64748b; margin-top:6px; font-weight:600; }
.hb-metric-value { font-size:26px; font-weight:800; margin-top:2px; letter-spacing:-0.01em; }
.hb-metric-sub { font-size:11px; color:#94a3b8; margin-top:2px; }

.hb-two-col { display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px; }
.hb-card { background:#ffffff; border:1px solid #e2e8f0; border-radius:20px; padding:20px; box-shadow: 0 6px 20px -14px rgba(15,23,42,0.2); }
.hb-card-title { font-size:13px; font-weight:700; color:#0f172a; margin-bottom:10px; letter-spacing:-0.01em; }
.hb-legend { display:flex; align-items:center; gap:6px; font-size:11px; color:#64748b; margin-top:10px; }
.hb-dot { width:8px; height:8px; border-radius:4px; display:inline-block; }
.hb-list { list-style:none; padding:0; margin:0; }
.hb-list li { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed #e2e8f0; font-size:13px; }
.hb-list li:last-child { border-bottom:0; }
.hb-bullets { list-style:none; padding:0; margin:0; }
.hb-bullets li { padding:8px 0; border-bottom:1px solid #edf2f7; font-size:14px; line-height:1.55; }
.hb-bullets li::before { content:"•"; color:#38bdf8; font-weight:800; margin-inline-end:8px; }
.hb-recs { list-style:none; padding:0; margin:0; }
.hb-recs li { padding:12px 0; border-bottom:1px solid #edf2f7; }
.hb-rec-title { font-weight:700; margin-bottom:4px; }

.hb-day { background:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:14px 18px; margin-bottom:12px; }
.hb-day-head { font-weight:700; margin-bottom:8px; font-size:14px; }
.hb-timeline { list-style:none; padding:0; margin:0; }
.hb-timeline li { display:flex; gap:10px; align-items:flex-start; padding:6px 0; font-size:13px; }
.hb-t-icon { font-size:18px; }
.hb-t-title { font-weight:600; }

.hb-photos { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
.hb-photo img { width:100%; height:220px; object-fit:cover; border-radius:14px; border:1px solid #e2e8f0; }

@media print {
  body { background:#fff; }
  .hb-book { background:#fff; }
  .hb-page { box-shadow:none; margin:0; border-radius:0; page-break-after: always; }
}
`;
