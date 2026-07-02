/**
 * Lightweight i18n scaffold. Hebrew is the default; the structure is ready
 * for English (and more) without pulling a full library yet.
 */
export type Locale = "he" | "en";

export const DEFAULT_LOCALE: Locale = "he";

type Dict = Record<string, string>;

const HE: Dict = {
  "app.name": "KobiOS",
  "app.tagline": "מרכז השליטה האישי שלך",
  "nav.home": "היום",
  "nav.train": "אימון",
  "nav.fuel": "תזונה",
  "nav.health": "בריאות",
  "nav.shift": "משמרת",
  "nav.trend": "מגמות",
  "home.title": "היום שלי",
  "home.greeting.morning": "בוקר טוב",
  "home.greeting.afternoon": "צהריים טובים",
  "home.greeting.evening": "ערב טוב",
  "home.greeting.night": "לילה טוב",
  "home.section.protein": "חלבון היום",
  "home.section.workout": "האימון של היום",
  "home.section.health": "סיכום בריאות",
  "home.section.ai": "תובנת AI",
  "home.ai.placeholder": "המאמן החכם יופיע כאן בקרוב — ילמד את הדפוסים שלך ויציע צעד אחד קטן ליום.",
  "home.workout.none": "אין אימון מתוזמן — לחץ להוספה.",
  "home.health.none": "טרם נרשם מדד בריאות היום.",
  "home.protein.of": "מתוך",
  "home.quickAdd": "הוספה מהירה",
  "shift.today": "המשמרת של היום",
  "action.logWorkout": "רישום אימון",
  "action.logMeal": "רישום ארוחה",
  "action.logHealth": "רישום בריאות",
  "action.signOut": "יציאה",
  "common.grams": "גרם",
  "common.minutes": "דק'",
  "common.of10": "מתוך 10",
};

const EN: Dict = {
  "app.name": "KobiOS",
  "app.tagline": "Your personal command center",
  "nav.home": "Today",
  "nav.train": "Train",
  "nav.fuel": "Fuel",
  "nav.health": "Health",
  "nav.shift": "Shift",
  "nav.trend": "Trends",
  "home.title": "My Day",
  "home.greeting.morning": "Good morning",
  "home.greeting.afternoon": "Good afternoon",
  "home.greeting.evening": "Good evening",
  "home.greeting.night": "Late night",
  "home.section.protein": "Protein today",
  "home.section.workout": "Today's workout",
  "home.section.health": "Health summary",
  "home.section.ai": "AI insight",
  "home.ai.placeholder": "Your smart coach will live here soon — learning your patterns and suggesting one small next step.",
  "home.workout.none": "No workout scheduled — tap to add.",
  "home.health.none": "No health check logged yet today.",
  "home.protein.of": "of",
  "home.quickAdd": "Quick add",
  "shift.today": "Today's shift",
  "action.logWorkout": "Log workout",
  "action.logMeal": "Log meal",
  "action.logHealth": "Log health",
  "action.signOut": "Sign out",
  "common.grams": "g",
  "common.minutes": "min",
  "common.of10": "/ 10",
};

const DICTS: Record<Locale, Dict> = { he: HE, en: EN };

let currentLocale: Locale = DEFAULT_LOCALE;

export function setLocale(l: Locale) {
  currentLocale = l;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function isRTL(l: Locale = currentLocale) {
  return l === "he";
}

export function t(key: keyof typeof HE | string): string {
  return DICTS[currentLocale][key] ?? DICTS.en[key] ?? key;
}
