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
  "nav.meals": "ארוחות",
  "nav.health": "בריאות",
  "nav.shift": "משמרת",
  "nav.trend": "מגמות",

  // Home / dashboard
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

  // Smart Coach
  "coach.title": "המאמן החכם שלך",
  "coach.hello": "שלום",
  "coach.empty": "הכל נראה מצוין. יום נעים!",
  "coach.protein.left": "נותרו לך {g} גרם חלבון להיום.",
  "coach.protein.almost": "עבודה יפה. כבר הגעת ל־{pct}% מיעד החלבון.",
  "coach.protein.done": "עמדת ביעד החלבון של היום 💪",
  "coach.water.gap": "לא שתית מים כבר {h} שעות.",
  "coach.water.none": "עדיין לא רשמת שתייה היום.",
  "coach.workout.none": "עוד לא התאמנת היום — אולי תזוזה קלה?",
  "coach.meal.gap": "לא אכלת כבר {h} שעות — שקול חטיף חלבון.",
  "coach.shift.day": "אתה במשמרת יום (08:15–20:30). תשמור על שתייה קבועה.",
  "coach.shift.night": "משמרת לילה הערב (20:15–08:30) — חלבון וקפה לפני היציאה.",
  "coach.shift.night1": "לילה 1 הערב — היום נועד למנוחה והכנת אוכל לפני המשמרת.",
  "coach.shift.half_rest": "היום יום מנוחה חצי-יום — התאוששות והכנת אוכל לפני הלילה.",
  "coach.shift.off": "יום חופש — הזדמנות מצוינת לאימון קל וארוחה איכותית.",
  "coach.habit.meal": "לפי ההרגלים שלך, סביב {time} אתה בדרך כלל אוכל {food}.",
  "coach.habit.supplement": "לא רשמת {name} היום — אל תשכח.",
  "coach.weight.trend.down": "מגמת המשקל חיובית — ירידה של {kg} ק״ג ב-30 הימים האחרונים.",
  "coach.weight.trend.up": "המשקל עלה ב-{kg} ק״ג ב-30 הימים האחרונים.",
  "coach.protein.streak": "עמדת ביעד החלבון {n} ימים ברצף — כל הכבוד.",
  "coach.fish.gap": "עברו {d} ימים מאז שאכלת דג — שקול טונה או סלמון היום.",
  "coach.sleep.low": "ישנת {h} שעות בממוצע לילה שעברה — פחות מהממוצע השבועי שלך ({avg}).",
  "coach.pain.trend": "כאב ה{area} במגמת עלייה בימים האחרונים — שקול תרגילי גמישות קלים.",

  // Timeline
  "timeline.title": "ציר היום",
  "timeline.subtitle": "כל מה שרשמת מאז תחילת היום",
  "timeline.empty": "עדיין לא נרשם דבר היום",
  "timeline.emptyHint": "השתמש בכפתורי המהירים למטה",
  "timeline.meal": "ארוחה",
  "timeline.water": "מים",
  "timeline.workout": "אימון",
  "timeline.supplement": "תוסף",
  "timeline.weight": "משקל",
  "timeline.sleep": "שינה",
  "timeline.health": "בריאות",

  // One-tap quick actions
  "quick.title": "הוספה בלחיצה",
  "quick.hint": "לחיצה אחת ורשום",
  "quick.supplement": "תוסף",
  "quick.weight": "משקל",
  "quick.sleep": "שינה",
  "quick.prompt.supplement": "שם התוסף?",
  "quick.prompt.weight": "משקל בק״ג?",
  "quick.prompt.sleep": "כמה שעות ישנת?",
  "quick.saved.water": "מים נרשמו",
  "quick.saved.supplement": "תוסף נרשם",
  "quick.saved.weight": "משקל נרשם",
  "quick.saved.sleep": "שינה נרשמה",

  // Meals module
  "meals.title": "ארוחות",
  "meals.today": "הארוחות של היום",
  "meals.empty": "עדיין לא נרשמו ארוחות היום",
  "meals.emptyHint": "לחץ על הכפתור למטה כדי להוסיף",
  "meals.add": "הוספת ארוחה",
  "meals.addPhoto": "צילום ארוחה",
  "meals.addFavorite": "מועדפים",
  "meals.addManual": "הוספה ידנית",
  "meals.favorites": "מועדפים",
  "meals.favoritesHint": "לחץ להוספה מהירה",
  "meals.type": "סוג הארוחה",
  "meals.location": "מיקום",
  "meals.time": "שעה",
  "meals.date": "תאריך",
  "meals.foods": "מאכלים",
  "meals.addFood": "הוסף מאכל",
  "meals.foodName": "שם המאכל",
  "meals.qty": "כמות",
  "meals.notes": "הערות",
  "meals.photo": "תמונה",
  "meals.photoHint": "צלם את הצלחת — ניתוח AI יגיע בקרוב",
  "meals.retakePhoto": "החלף תמונה",
  "meals.save": "שמור ארוחה",
  "meals.saved": "הארוחה נשמרה",
  "meals.deleted": "הארוחה נמחקה",
  "meals.estimated": "הערכה תזונתית",
  "meals.kcal": "קק״ל",
  "meals.protein": "חלבון",
  "meals.carbs": "פחמימות",
  "meals.fat": "שומן",
  "meals.aiSoon": "ניתוח תמונה חכם בפיתוח",
  "meals.aiSoonHint": "צילום המנה יזוהה אוטומטית — הכנת ברקוד ומתכונים בהמשך",

  // Workouts
  "workouts.title": "אימונים",
  "workouts.subtitle": "רישום מפגשים וסטים.",
  "workouts.session": "מפגש",
  "workouts.new": "מפגש חדש",
  "workouts.empty": "לחץ על ״מפגש חדש״ כדי להתחיל.",
  "workouts.name": "שם",
  "workouts.date": "תאריך",
  "workouts.duration": "משך (דקות)",
  "workouts.notes": "הערות",
  "workouts.addSet": "הוסף סט",
  "workouts.category": "קטגוריה",
  "workouts.categoryAll": "כל הקטגוריות",
  "workouts.exercise": "תרגיל",
  "workouts.reps": "חזרות",
  "workouts.weightKg": "משקל ק״ג",
  "workouts.rpe": "RPE",
  "workouts.set": "סט",
  "workouts.sets": "סטים",
  "workouts.delete": "מחק מפגש",
  "workouts.library": "ספרייה: {n} תבניות תרגיל.",
  "workouts.saved": "נשמר",
  "workouts.cat.push": "דחיפה",
  "workouts.cat.pull": "משיכה",
  "workouts.cat.legs": "רגליים",
  "workouts.cat.core": "בטן",
  "workouts.cat.mobility": "מוביליות",
  "workouts.cat.conditioning": "אירובי",

  // Shift
  "shift.today": "המשמרת של היום",
  "shift.title": "לוח משמרות",
  "shift.subtitle": "מחזור אינטל 9 ימים · 2 יום · חצי מנוחה · 2 לילה · 4 חופש",
  "shift.set": "הגדרת מחזור",
  "shift.update": "עדכון נקודת עיגון",
  "shift.firstDay": "יום עבודה ראשון במחזור (יום 1)",
  "shift.starting": "משמרת התחלה",
  "shift.day12": "יום (08:15–20:30)",
  "shift.night12": "לילה (20:15–08:30)",
  "shift.halfRest": "יום מנוחה חצי-יום",
  "shift.save": "שמור לוח",
  "shift.pattern": "מחזור: יום 1 · יום 2 · חצי מנוחה · לילה 1 · לילה 2 · חופש 1–4 · וחוזר חלילה.",
  "shift.saved": "הלוח נשמר",
  "shift.legend.day": "יום",
  "shift.legend.night": "לילה",
  "shift.legend.half_rest": "חצי מנוחה",
  "shift.legend.off": "חופש",
  "shift.short.day": "יום",
  "shift.short.night": "לילה",
  "shift.short.half_rest": "מנוחה",
  "shift.short.off": "חופש",

  // Health
  "health.title": "מעקב בריאות",
  "health.subtitle": "צוואר · גב תחתון · כתף · כללי",
  "health.area": "אזור",
  "health.date": "תאריך",
  "health.pain": "כאב",
  "health.mobility": "טווח תנועה",
  "health.painHint": "0 אין · 10 חזק",
  "health.mobilityHint": "0 תקוע · 10 מלא",
  "health.exercisesDone": "תרגילים שבוצעו",
  "health.exercisesPh": "מקנזי, משיכת סנטר...",
  "health.notes": "הערות",
  "health.log": "רשום מדד",
  "health.history": "היסטוריה",
  "health.empty": "אין רישומים עדיין.",
  "health.saved": "נרשם",
  "health.area.neck": "צוואר",
  "health.area.sciatica": "גב תחתון",
  "health.area.ac_joint": "כתף (AC)",
  "health.area.general": "כללי",

  // Nutrition (macro logger)
  "nutrition.title": "תזונה",
  "nutrition.subtitle": "רישום ארוחות ומאקרו.",
  "nutrition.date": "תאריך",
  "nutrition.add": "הוספת פריט",
  "nutrition.food": "מאכל",
  "nutrition.empty": "אין רישומים ליום זה.",
  "nutrition.meal.breakfast": "בוקר",
  "nutrition.meal.lunch": "צהריים",
  "nutrition.meal.dinner": "ערב",
  "nutrition.meal.snack": "חטיף",

  // Progress
  "progress.title": "מגמות",
  "progress.subtitle": "30 הימים האחרונים.",
  "progress.chart.volume": "נפח אימון (דק׳/יום)",
  "progress.chart.nutrition": "קלוריות וחלבון",
  "progress.chart.pain": "כאב — {area}",

  // Auth
  "auth.email": "אימייל",
  "auth.password": "סיסמה",
  "auth.signin": "התחברות",
  "auth.signup": "יצירת חשבון",
  "auth.toggleToSignup": "פעם ראשונה כאן? יצירת חשבון",
  "auth.toggleToSignin": "כבר יש חשבון? התחברות",
  "auth.tagline": "המרכז הפרטי שלך.",
  "auth.created": "חשבון נוצר. אתה בפנים.",
  "auth.failed": "ההזדהות נכשלה",
  "auth.emailInvalid": "אימייל לא תקין",
  "auth.passwordShort": "לפחות 8 תווים",

  // Actions
  "action.logWorkout": "רישום אימון",
  "action.logMeal": "רישום ארוחה",
  "action.logHealth": "רישום בריאות",
  "action.signOut": "יציאה",
  "action.close": "סגור",
  "action.delete": "מחיקה",
  "action.save": "שמור",

  // Common
  "common.grams": "גרם",
  "common.minutes": "דק'",
  "common.hours": "שעות",
  "common.kcal": "קק״ל",
  "common.of10": "מתוך 10",
  "common.cancel": "ביטול",
  "common.close": "סגור",
  "common.all": "הכל",
  "common.today": "היום",
  "common.notSet": "טרם הוגדר",
  "common.error": "שגיאה",
  "common.loading": "טוען...",
};

const EN: Dict = {
  "app.name": "KobiOS",
  "nav.home": "Today",
  "coach.hello": "Hello",
  "action.signOut": "Sign out",
  "common.grams": "g",
  "common.minutes": "min",
  "common.hours": "h",
  "common.kcal": "kcal",
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

export function t(key: string): string {
  return DICTS[currentLocale][key] ?? DICTS.en[key] ?? key;
}
