/**
 * Home Coach (VIORA-HOME-REDESIGN-001)
 *
 * Two pure builders for the redesigned Home Command Center:
 *
 *  1. `buildCoachMessage` — the single human-sounding coach paragraph that
 *     sits under the Daily Score. It INTERPRETS the day (3–4 short lines)
 *     and deliberately avoids listing raw metrics, because every metric has
 *     exactly one home inside the category cards (Constitution rule 12).
 *
 *  2. `buildQuickActions` — context-aware shortcuts. The list is ordered by
 *     what is actually useful right now and never repeats today's focus.
 *
 * Pure, JSON-safe, no fetching, never invents numbers.
 */
import type { ShiftKind } from "@/lib/shift";
import type { FocusId } from "@/lib/command-center";

/* ------------------------------------------------------------------ */
/* Coach message                                                       */
/* ------------------------------------------------------------------ */

export interface CoachMessageInput {
  now: Date;
  firstName: string;
  shift: ShiftKind | null;
  checkinDone: boolean;
  score: number | null;
  lastSleepHours: number | null;
  avgSleepHours: number | null;
  waterPct: number | null;
  proteinPct: number | null;
  workoutDoneToday: boolean;
  plannedWorkoutToday: boolean;
  painLevel: number | null;
  mealsCount: number;
  streakDays: number;
}

export interface CoachMessage {
  /** 3–4 short sentences, already ordered. */
  lines: string[];
}

/**
 * Speaks like a coach: opens with how the day looks, adds the one thing that
 * stands out, and closes with a single suggestion. No numbers dumps.
 */
export function buildCoachMessage(i: CoachMessageInput): CoachMessage {
  const hour = i.now.getHours();
  const name = i.firstName ? ` ${i.firstName}` : "";
  const lines: string[] = [];

  /* --- 1. Opening: the feel of the day --- */
  if (!i.checkinDone) {
    lines.push(`בוא נתחיל${name} — ספר לי איך אתה מרגיש והיום כבר יתפוס צורה.`);
  } else if (i.score != null && i.score >= 80) {
    lines.push(`היום נראה חזק${name}. הגוף מסודר והראש בכיוון.`);
  } else if (i.score != null && i.score >= 55) {
    lines.push(`היום סביר${name} — לא מושלם, אבל בהחלט אפשר לעבוד איתו.`);
  } else if (i.score != null) {
    lines.push(`היום מתחיל כבד יותר${name}, וזה בסדר גמור.`);
  } else {
    lines.push(`אני עוד לומדת את הקצב שלך${name}, אז ניקח את היום בעדינות.`);
  }

  /* --- 2. The one thing that stands out --- */
  if (i.painLevel != null && i.painLevel >= 6) {
    lines.push("הכאב שדיווחת עליו הוא הדבר שהכי משפיע כרגע, ולכן שאר היום נבנה סביבו.");
  } else if (i.lastSleepHours != null && i.lastSleepHours < 6) {
    lines.push("השינה הלילה הייתה קצרה, אז סביר שהאנרגיה תגיע בגלים ולא ברצף.");
  } else if (
    i.lastSleepHours != null &&
    i.avgSleepHours != null &&
    i.lastSleepHours >= i.avgSleepHours + 0.5
  ) {
    lines.push("ישנת יותר מהרגיל שלך, וזה בדיוק הבסיס שמאפשר עומס אמיתי.");
  } else if (i.shift === "night") {
    lines.push("משמרת לילה מזיזה הכול אחורה, אז נשמור על שתייה וארוחות קטנות לאורך המשמרת.");
  } else if (i.shift === "day") {
    lines.push("יום עבודה מלא — הזמן הפנוי יהיה קצר, לכן כדאי לתפוס את החלונות שיש.");
  } else if (i.workoutDoneToday) {
    lines.push("האימון של היום מאחוריך, ומכאן הכול עובר להתאוששות.");
  } else if (i.streakDays >= 2) {
    lines.push(`אתה בתוך רצף של ${i.streakDays} ימים — שווה לא לשבור אותו היום.`);
  } else {
    lines.push("אין שום דבר דרמטי על השולחן, וזה בדיוק סוג היום שבונה עקביות.");
  }

  /* --- 3. One suggestion, phrased as a coach and not as a task list --- */
  if (i.plannedWorkoutToday && !i.workoutDoneToday) {
    lines.push(
      hour >= 20
        ? "אם לא מרגיש לך אימון מלא, גם גרסה מקוצרת נחשבת."
        : "כשתהיה מוכן, האימון מחכה — עדיף להתחיל מוקדם מלדחות.",
    );
  } else if (i.waterPct != null && i.waterPct < 60 && hour >= 11) {
    lines.push("הדבר הקטן שישנה הכי הרבה עד הצהריים הוא פשוט לשתות יותר.");
  } else if (i.mealsCount === 0 && hour >= 11) {
    lines.push("עוד לא אכלת כלום מבחינתי — ארוחה אחת עכשיו תשנה את המשך היום.");
  } else if (i.proteinPct != null && i.proteinPct < 65 && hour >= 15) {
    lines.push("החלבון מפגר מאחור, וזה בדרך כלל מרגיש בעיקר לקראת הערב.");
  } else if (i.workoutDoneToday) {
    lines.push("תן לגוף אוכל ושינה, והאימון של מחר ייראה אחרת לגמרי.");
  } else {
    lines.push("שמור על הקצב הזה, אני אעדכן אותך אם משהו יזוז.");
  }

  return { lines: lines.slice(0, 4) };
}

/* ------------------------------------------------------------------ */
/* Dynamic quick actions                                               */
/* ------------------------------------------------------------------ */

export type QuickActionId =
  | "workout"
  | "planner"
  | "capture"
  | "hydration"
  | "health"
  | "journal"
  | "progress"
  | "nutrition"
  | "shift";

export interface QuickAction {
  id: QuickActionId;
  label: string;
  to: string;
  /** lucide icon name resolved by the UI. */
  icon:
    | "dumbbell"
    | "calendar"
    | "camera"
    | "droplet"
    | "heart"
    | "book"
    | "trending"
    | "utensils"
    | "clock";
  tint: string;
}

const CATALOG: Record<QuickActionId, QuickAction> = {
  workout: {
    id: "workout",
    label: "אימון",
    to: "/workouts",
    icon: "dumbbell",
    tint: "bg-primary/12 text-primary",
  },
  planner: {
    id: "planner",
    label: "מתכנן",
    to: "/workouts/program",
    icon: "calendar",
    tint: "bg-accent/20 text-accent",
  },
  capture: {
    id: "capture",
    label: "צילום ארוחה",
    to: "/capture",
    icon: "camera",
    tint: "bg-orange-500/15 text-orange-300",
  },
  hydration: {
    id: "hydration",
    label: "שתייה",
    to: "/hydration",
    icon: "droplet",
    tint: "bg-sky-500/15 text-sky-300",
  },
  health: {
    id: "health",
    label: "בריאות",
    to: "/health",
    icon: "heart",
    tint: "bg-rose-500/15 text-rose-300",
  },
  journal: {
    id: "journal",
    label: "יומן",
    to: "/journal",
    icon: "book",
    tint: "bg-accent/20 text-accent",
  },
  progress: {
    id: "progress",
    label: "התקדמות",
    to: "/progress",
    icon: "trending",
    tint: "bg-sky-500/15 text-sky-300",
  },
  nutrition: {
    id: "nutrition",
    label: "תזונה",
    to: "/nutrition",
    icon: "utensils",
    tint: "bg-orange-500/15 text-orange-300",
  },
  shift: {
    id: "shift",
    label: "משמרות",
    to: "/shift",
    icon: "clock",
    tint: "bg-white/10 text-foreground",
  },
};

export interface QuickActionsInput {
  now: Date;
  /** Focus route already surfaced by the hero CTA — never repeated here. */
  focusId: FocusId;
  shift: ShiftKind | null;
  workoutDoneToday: boolean;
  plannedWorkoutToday: boolean;
  waterPct: number | null;
  proteinPct: number | null;
  mealsCount: number;
  painLevel: number | null;
}

/** Returns exactly 4 context-relevant shortcuts, focus excluded. */
export function buildQuickActions(i: QuickActionsInput): QuickAction[] {
  const hour = i.now.getHours();
  const score = new Map<QuickActionId, number>();
  const bump = (id: QuickActionId, n: number) => score.set(id, (score.get(id) ?? 0) + n);

  // Baselines keep the grid stable and predictable.
  bump("workout", 40);
  bump("capture", 38);
  bump("hydration", 34);
  bump("progress", 20);
  bump("planner", 18);
  bump("nutrition", 16);
  bump("health", 14);
  bump("journal", 12);
  bump("shift", 6);

  if (i.plannedWorkoutToday && !i.workoutDoneToday) bump("workout", 45);
  if (i.workoutDoneToday) {
    bump("workout", -35);
    bump("capture", 15);
    bump("progress", 20);
    bump("planner", 12);
  }
  if (i.waterPct != null && i.waterPct < 70 && hour >= 10) bump("hydration", 30);
  if (i.waterPct != null && i.waterPct >= 95) bump("hydration", -25);
  if (i.mealsCount === 0 && hour >= 10) bump("capture", 30);
  if (i.proteinPct != null && i.proteinPct < 65 && hour >= 14) {
    bump("capture", 20);
    bump("nutrition", 18);
  }
  if (i.painLevel != null && i.painLevel >= 5) bump("health", 40);
  if (i.shift === "night" || i.shift === "half_rest") bump("shift", 22);
  if (hour >= 21) bump("journal", 24);

  // Focus already owns the primary CTA — do not duplicate it.
  const focusToAction: Partial<Record<FocusId, QuickActionId>> = {
    workout: "workout",
    water: "hydration",
    meal: "capture",
    recovery: "health",
    checkin: "journal",
    rest: "progress",
  };
  const excluded = focusToAction[i.focusId];

  return [...score.entries()]
    .filter(([id]) => id !== excluded)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => CATALOG[id]);
}
