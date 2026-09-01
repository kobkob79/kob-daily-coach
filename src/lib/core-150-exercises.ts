import { normalizeSearchText } from "./search-normalize.ts";

/** Legacy names mirrored from the approved Core 150 migration, in canonical number order. */
const LEGACY_CORE_150_EXERCISE_NAMES = `
לחיצת חזה במוט
לחיצת חזה בדאמבלים
לחיצת חזה במכונה
לחיצת חזה בשיפוע חיובי במוט
לחיצת חזה בשיפוע חיובי בדאמבלים
לחיצת חזה בשיפוע חיובי במכונה
לחיצת חזה בשיפוע שלילי במוט
לחיצת חזה בשיפוע שלילי בדאמבלים
פרפר במכונה
פרפר בכבלים בעמידה
פרפר בכבלים מלמעלה למטה
פרפר בכבלים מלמטה למעלה
פרפר בדאמבלים בשכיבה
שכיבות סמיכה
מקבילים בדגש על החזה
מתח באחיזה רחבה
מתח באחיזה צרה
מתח באחיזה הפוכה
משיכת פולי עליון באחיזה רחבה
משיכת פולי עליון באחיזה צרה
משיכת פולי עליון באחיזה הפוכה
חתירה בישיבה בכבל
חתירה במכונה
חתירה במכונה עם תמיכת חזה
חתירה בדאמבל ביד אחת
חתירה במוט
חתירה בטי־בר
חתירה בדאמבלים עם תמיכת חזה
משיכת זרועות ישרות בכבל
פולאובר בכבל
פולאובר בדאמבל
חתירה בפולי נמוך באחיזה רחבה
חתירה בפולי נמוך באחיזה צרה
חתירה הפוכה במשקל גוף
משיכת גומייה לכיוון החזה
לחיצת כתפיים בדאמבלים
לחיצת כתפיים במכונה
לחיצת כתפיים במוט
לחיצת ארנולד
הרחקת כתפיים בדאמבלים
הרחקת כתפיים בכבל
הרחקת כתפיים במכונה
הרחקת כתף בכבל ביד אחת
הרמת ידיים קדימה בדאמבלים
הרמת ידיים קדימה בכבל
פרפר הפוך במכונה
פרפר הפוך בדאמבלים
משיכת חבל לפנים
משיכה אנכית בכבל
סיבוב כתף חיצוני בכבל
כפיפת מרפקים במוט ישר
כפיפת מרפקים במוט EZ
כפיפת מרפקים בדאמבלים
כפיפת מרפקים לסירוגין בדאמבלים
כפיפת מרפקים בפטיש
כפיפת מרפקים בכבל
כפיפת מרפקים בכבל ביד אחת
כפיפת מרפקים על ספסל שיפוע
כפיפת מרפקים על ספסל סקוט
כפיפת מרפקים במכונת סקוט
כפיפת מרפקים בריכוז
כפיפת מרפקים הפוכה במוט
פשיטת מרפקים בחבל בכבל
פשיטת מרפקים במוט ישר בכבל
פשיטת מרפקים בכבל ביד אחת
פשיטת מרפקים מעל הראש בחבל
פשיטת מרפקים מעל הראש בדאמבל
לחיצת חזה באחיזה צרה
פשיטת מרפקים בשכיבה במוט EZ
פשיטת מרפקים בשכיבה בדאמבלים
קיקבק בדאמבל
קיקבק בכבל
מקבילים בדגש על יד אחורית
פשיטת מרפקים במכונה
סקוואט עם מוט
סקוואט קדמי
גובלט סקוואט
האק סקוואט
לחיצת רגליים
לחיצת רגליים חד־צדדית
פשיטת ברכיים במכונה
פשיטת ברך חד־צדדית במכונה
לאנג' קדמי
לאנג' לאחור
בולגרי ספליט סקוואט
עלייה על מדרגה
כפיפת ברכיים בשכיבה
כפיפת ברכיים בישיבה
כפיפת ברך בעמידה
דדליפט רומני במוט
דדליפט רומני בדאמבלים
דדליפט רומני חד־צדדי
גוד מורנינג
נורדיק קרל
כפיפת ברכיים עם כדור פיזיו
כפיפת ברכיים בהחלקה על הרצפה
היפ תראסט במוט
היפ תראסט במכונה
גשר ישבן
גשר ישבן חד־צדדי
בעיטת ישבן בכבל
בעיטת ישבן במכונה
הרחקת ירך במכונה
הרחקת ירך בכבל
הליכה צידית עם גומייה
סומו סקוואט
הרמת עקבים בעמידה במכונה
הרמת עקבים בישיבה
הרמת עקבים בלחיצת רגליים
הרמת עקבים בעמידה עם דאמבלים
הרמת עקב חד־צדדית
הרמת אצבעות כף הרגל
פלאנק
פלאנק צידי
פלאנק עם נגיעות כתף
דד באג
בירד דוג
פאלוף פרס
פאלוף פרס בכריעה
כפיפות בטן בכבל
כפיפות בטן במכונה
הרמת ברכיים בכיסא רומי
הרמת רגליים בשכיבה
רולאאוט עם גלגל בטן
נשיאת משקל ביד אחת
נשיאת משקל מעל הראש ביד אחת
סיבוב גו בכבל
דדליפט קלאסי
דדליפט סומו
דחיפת מזחלת
משיכת מזחלת
הליכת חקלאי
סווינג עם קטלבל
סקוואט ולחיצה עם דאמבלים
עלייה למדרגה עם משקולות
משיכת גומייה לצדדים
סיבוב כתף חיצוני עם גומייה
סיבוב כתף פנימי עם גומייה
החלקת ידיים על קיר
הרחקת שכמות בעמידת שש
קירוב שכמות עם גומייה
מתיחת מכופפי הירך
מתיחת הירך האחורית
מתיחת ארבע־ראשי
מתיחת התאומים
סיבובי עמוד שדרה חזי
פתיחת בית חזה בשכיבה על הצד
תנועת חתול־פרה
מוביליות קרסול מול קיר
הרחקת ירך בשכיבה על הצד
`
  .trim()
  .split("\n");

export const CORE_150_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs_glutes",
  "calves",
  "core",
  "conditioning",
  "mobility",
] as const;

export type Core150MuscleGroup = (typeof CORE_150_MUSCLE_GROUPS)[number];

export interface Core150Exercise {
  readonly exerciseNumber: number;
  readonly canonicalHebrewName: string;
  readonly englishName: string;
  readonly aliases: readonly string[];
  readonly muscleGroup: Core150MuscleGroup;
}

type Core150Definition = readonly [
  exerciseNumber: number,
  muscleGroup: Core150MuscleGroup,
  canonicalHebrewName: string,
  englishName: string,
];

/** Approved Viora Core 150 Naming Canon V2, keyed only by exercise number/order. */
const CORE_150_V2_DEFINITIONS: readonly Core150Definition[] = [
  [1, "chest", "לחיצת חזה עם מוט", "Barbell Bench Press"],
  [2, "chest", "לחיצת חזה עם משקולות יד", "Dumbbell Bench Press"],
  [3, "chest", "לחיצת חזה במכונה", "Machine Chest Press"],
  [4, "chest", "לחיצת חזה בשיפוע חיובי עם מוט", "Incline Barbell Bench Press"],
  [5, "chest", "לחיצת חזה בשיפוע חיובי עם משקולות יד", "Incline Dumbbell Bench Press"],
  [6, "chest", "לחיצת חזה בשיפוע חיובי במכונה", "Incline Machine Chest Press"],
  [7, "chest", "לחיצת חזה בשיפוע שלילי עם מוט", "Decline Barbell Bench Press"],
  [8, "chest", "לחיצת חזה בשיפוע שלילי עם משקולות יד", "Decline Dumbbell Bench Press"],
  [9, "chest", "פרפר במכונה", "Pec Deck Fly"],
  [10, "chest", "פרפר בכבלים בעמידה", "Standing Cable Fly"],
  [11, "chest", "פרפר בכבלים מלמעלה למטה", "High-to-Low Cable Fly"],
  [12, "chest", "פרפר בכבלים מלמטה למעלה", "Low-to-High Cable Fly"],
  [13, "chest", "פרפר בשכיבה עם משקולות יד", "Dumbbell Fly"],
  [14, "chest", "שכיבות סמיכה", "Push-Up"],
  [15, "chest", "מקבילים בדגש על החזה", "Chest Dip"],
  [16, "back", "מתח באחיזה רחבה", "Wide-Grip Pull-Up"],
  [17, "back", "מתח באחיזה צרה", "Close-Grip Pull-Up"],
  [18, "back", "מתח באחיזה הפוכה", "Chin-Up"],
  [19, "back", "משיכת פולי עליון באחיזה רחבה", "Wide-Grip Lat Pulldown"],
  [20, "back", "משיכת פולי עליון באחיזה צרה", "Close-Grip Lat Pulldown"],
  [21, "back", "משיכת פולי עליון באחיזה הפוכה", "Reverse-Grip Lat Pulldown"],
  [22, "back", "חתירה בישיבה בכבל", "Seated Cable Row"],
  [23, "back", "חתירה במכונה", "Machine Row"],
  [24, "back", "חתירה במכונה עם תמיכת חזה", "Chest-Supported Machine Row"],
  [25, "back", "חתירה ביד אחת עם משקולת יד", "One-Arm Dumbbell Row"],
  [26, "back", "חתירה בהטיית גו עם מוט", "Barbell Bent-Over Row"],
  [27, "back", "חתירת T-Bar", "T-Bar Row"],
  [28, "back", "חתירה עם משקולות יד בתמיכת חזה", "Chest-Supported Dumbbell Row"],
  [29, "back", "משיכת ידיים ישרות בפולי עליון", "Straight-Arm Cable Pulldown"],
  [30, "back", "פולאובר בכבל", "Cable Pullover"],
  [31, "back", "פולאובר עם משקולת יד", "Dumbbell Pullover"],
  [32, "back", "חתירה בפולי תחתון באחיזה רחבה", "Wide-Grip Seated Cable Row"],
  [33, "back", "חתירה בפולי תחתון באחיזה צרה", "Close-Grip Seated Cable Row"],
  [34, "back", "חתירה הפוכה במשקל גוף", "Inverted Row"],
  [35, "back", "חתירה עם גומיית התנגדות", "Resistance Band Row"],
  [36, "shoulders", "לחיצת כתפיים עם משקולות יד", "Dumbbell Shoulder Press"],
  [37, "shoulders", "לחיצת כתפיים במכונה", "Machine Shoulder Press"],
  [38, "shoulders", "לחיצת כתפיים עם מוט", "Barbell Shoulder Press"],
  [39, "shoulders", "לחיצת ארנולד", "Arnold Press"],
  [40, "shoulders", "הרחקת זרועות לצדדים עם משקולות יד", "Dumbbell Lateral Raise"],
  [41, "shoulders", "הרחקת זרועות לצדדים בכבל", "Cable Lateral Raise"],
  [42, "shoulders", "הרחקת זרועות לצדדים במכונה", "Machine Lateral Raise"],
  [43, "shoulders", "הרחקת זרוע לצד בכבל, יד אחת", "Single-Arm Cable Lateral Raise"],
  [44, "shoulders", "הרמת זרועות לפנים עם משקולות יד", "Dumbbell Front Raise"],
  [45, "shoulders", "הרמת זרועות לפנים בכבל", "Cable Front Raise"],
  [46, "shoulders", "פרפר הפוך במכונה", "Reverse Pec Deck Fly"],
  [47, "shoulders", "פרפר הפוך עם משקולות יד", "Dumbbell Reverse Fly"],
  [48, "shoulders", "משיכת חבל לפנים", "Face Pull"],
  [49, "shoulders", "חתירה אנכית בכבל", "Cable Upright Row"],
  [50, "shoulders", "סיבוב חיצוני של הכתף בכבל", "Cable External Rotation"],
  [51, "biceps", "כפיפת מרפקים עם מוט ישר", "Barbell Curl"],
  [52, "biceps", "כפיפת מרפקים עם מוט EZ", "EZ-Bar Curl"],
  [53, "biceps", "כפיפת מרפקים עם משקולות יד", "Dumbbell Curl"],
  [54, "biceps", "כפיפת מרפקים לסירוגין עם משקולות יד", "Alternating Dumbbell Curl"],
  [55, "biceps", "כפיפת מרפקים באחיזת פטיש", "Hammer Curl"],
  [56, "biceps", "כפיפת מרפקים בכבל", "Cable Curl"],
  [57, "biceps", "כפיפת מרפק ביד אחת בכבל", "Single-Arm Cable Curl"],
  [58, "biceps", "כפיפת מרפקים על ספסל בשיפוע עם משקולות יד", "Incline Dumbbell Curl"],
  [59, "biceps", "כפיפת מרפקים על ספסל כומר", "Preacher Curl"],
  [60, "biceps", "כפיפת מרפקים במכונת כומר", "Machine Preacher Curl"],
  [61, "biceps", "כפיפת מרפק בריכוז עם משקולת יד", "Concentration Curl"],
  [62, "biceps", "כפיפת מרפקים באחיזה הפוכה עם מוט", "Reverse Barbell Curl"],
  [63, "triceps", "פשיטת מרפקים בפולי עליון עם חבל", "Rope Triceps Pushdown"],
  [64, "triceps", "פשיטת מרפקים בפולי עליון עם מוט ישר", "Straight-Bar Triceps Pushdown"],
  [65, "triceps", "פשיטת מרפק ביד אחת בפולי עליון", "Single-Arm Cable Triceps Pushdown"],
  [66, "triceps", "פשיטת מרפקים מעל הראש בכבל עם חבל", "Overhead Rope Triceps Extension"],
  [67, "triceps", "פשיטת מרפקים מעל הראש עם משקולת יד", "Dumbbell Overhead Triceps Extension"],
  [68, "triceps", "לחיצת חזה באחיזה צרה עם מוט", "Close-Grip Bench Press"],
  [69, "triceps", "פשיטת מרפקים בשכיבה עם מוט EZ", "EZ-Bar Lying Triceps Extension"],
  [70, "triceps", "פשיטת מרפקים בשכיבה עם משקולות יד", "Dumbbell Lying Triceps Extension"],
  [71, "triceps", "פשיטת מרפק לאחור עם משקולת יד", "Dumbbell Triceps Kickback"],
  [72, "triceps", "פשיטת מרפק לאחור בכבל", "Cable Triceps Kickback"],
  [73, "triceps", "מקבילים בדגש על התלת-ראשי", "Triceps Dip"],
  [74, "triceps", "פשיטת מרפקים במכונה", "Machine Triceps Extension"],
  [75, "legs_glutes", "סקוואט אחורי עם מוט", "Barbell Back Squat"],
  [76, "legs_glutes", "סקוואט קדמי עם מוט", "Barbell Front Squat"],
  [77, "legs_glutes", "גובלט סקוואט עם משקולת יד", "Goblet Squat"],
  [78, "legs_glutes", "האק סקוואט במכונה", "Hack Squat"],
  [79, "legs_glutes", "לחיצת רגליים במכונה", "Leg Press"],
  [80, "legs_glutes", "לחיצת רגליים חד-צדדית במכונה", "Single-Leg Press"],
  [81, "legs_glutes", "פשיטת ברכיים במכונה", "Leg Extension"],
  [82, "legs_glutes", "פשיטת ברך חד-צדדית במכונה", "Single-Leg Extension"],
  [83, "legs_glutes", "מכרע קדמי", "Forward Lunge"],
  [84, "legs_glutes", "מכרע לאחור", "Reverse Lunge"],
  [85, "legs_glutes", "מכרע בולגרי", "Bulgarian Split Squat"],
  [86, "legs_glutes", "עלייה למדרגה", "Step-Up"],
  [87, "legs_glutes", "כפיפת ברכיים בשכיבה במכונה", "Lying Leg Curl"],
  [88, "legs_glutes", "כפיפת ברכיים בישיבה במכונה", "Seated Leg Curl"],
  [89, "legs_glutes", "כפיפת ברך בעמידה במכונה", "Standing Leg Curl"],
  [90, "legs_glutes", "דדליפט רומני עם מוט", "Barbell Romanian Deadlift"],
  [91, "legs_glutes", "דדליפט רומני עם משקולות יד", "Dumbbell Romanian Deadlift"],
  [92, "legs_glutes", "דדליפט רומני חד-צדדי", "Single-Leg Romanian Deadlift"],
  [93, "legs_glutes", "גוד מורנינג עם מוט", "Barbell Good Morning"],
  [94, "legs_glutes", "כפיפת ברכיים נורדית", "Nordic Hamstring Curl"],
  [95, "legs_glutes", "כפיפת ברכיים עם כדור פיזיו", "Swiss Ball Leg Curl"],
  [96, "legs_glutes", "כפיפת ברכיים בהחלקה על הרצפה", "Sliding Leg Curl"],
  [97, "legs_glutes", "דחיקת אגן עם מוט", "Barbell Hip Thrust"],
  [98, "legs_glutes", "דחיקת אגן במכונה", "Machine Hip Thrust"],
  [99, "legs_glutes", "גשר ישבן", "Glute Bridge"],
  [100, "legs_glutes", "גשר ישבן חד-צדדי", "Single-Leg Glute Bridge"],
  [101, "legs_glutes", "פשיטת ירך לאחור בכבל", "Cable Glute Kickback"],
  [102, "legs_glutes", "פשיטת ירך לאחור במכונה", "Machine Glute Kickback"],
  [103, "legs_glutes", "הרחקת ירך במכונה", "Hip Abduction Machine"],
  [104, "legs_glutes", "הרחקת ירך בכבל", "Cable Hip Abduction"],
  [105, "legs_glutes", "הליכה צידית עם גומיית התנגדות", "Lateral Band Walk"],
  [106, "legs_glutes", "סומו סקוואט", "Sumo Squat"],
  [107, "calves", "הרמת עקבים בעמידה במכונה", "Standing Calf Raise Machine"],
  [108, "calves", "הרמת עקבים בישיבה", "Seated Calf Raise"],
  [109, "calves", "הרמת עקבים במכשיר לחיצת רגליים", "Leg Press Calf Raise"],
  [110, "calves", "הרמת עקבים בעמידה עם משקולות יד", "Standing Dumbbell Calf Raise"],
  [111, "calves", "הרמת עקב חד-צדדית", "Single-Leg Calf Raise"],
  [112, "calves", "הרמת קדמת כף הרגל", "Tibialis Raise"],
  [113, "core", "פלאנק", "Plank"],
  [114, "core", "פלאנק צידי", "Side Plank"],
  [115, "core", "פלאנק עם נגיעות כתף", "Plank Shoulder Tap"],
  [116, "core", "דד באג", "Dead Bug"],
  [117, "core", "בירד דוג", "Bird Dog"],
  [118, "core", "לחיצת פאלוף נגד סיבוב", "Pallof Press"],
  [119, "core", "לחיצת פאלוף בכריעה נגד סיבוב", "Kneeling Pallof Press"],
  [120, "core", "כפיפות בטן בכבל", "Cable Crunch"],
  [121, "core", "כפיפות בטן במכונה", "Machine Crunch"],
  [122, "core", "הרמת ברכיים בכיסא קפטן", "Captain's Chair Knee Raise"],
  [123, "core", "הרמת רגליים בשכיבה", "Lying Leg Raise"],
  [124, "core", "רולאאוט עם גלגל בטן", "Ab Wheel Rollout"],
  [125, "core", "נשיאת מזוודה ביד אחת", "Suitcase Carry"],
  [126, "core", "נשיאת משקל מעל הראש ביד אחת", "Single-Arm Overhead Carry"],
  [127, "core", "סיבוב גו בכבל", "Cable Trunk Rotation"],
  [128, "conditioning", "דדליפט קלאסי", "Conventional Deadlift"],
  [129, "conditioning", "דדליפט סומו", "Sumo Deadlift"],
  [130, "conditioning", "דחיפת מזחלת", "Sled Push"],
  [131, "conditioning", "משיכת מזחלת", "Sled Pull"],
  [132, "conditioning", "הליכת חקלאי", "Farmer's Carry"],
  [133, "conditioning", "הנפת קטלבל", "Kettlebell Swing"],
  [134, "conditioning", "סקוואט ולחיצה מעל הראש עם משקולות יד", "Dumbbell Thruster"],
  [135, "conditioning", "עלייה למדרגה עם משקולות יד", "Dumbbell Step-Up"],
  [136, "mobility", "פתיחת גומיית התנגדות לצדדים בגובה החזה", "Band Pull-Apart"],
  [137, "mobility", "סיבוב חיצוני של הכתף עם גומיית התנגדות", "Band External Rotation"],
  [138, "mobility", "סיבוב פנימי של הכתף עם גומיית התנגדות", "Band Internal Rotation"],
  [139, "mobility", "החלקת זרועות על קיר", "Wall Slide"],
  [140, "mobility", "הרחקת שכמות בעמידת שש", "Quadruped Scapular Protraction"],
  [141, "mobility", "קירוב שכמות עם גומיית התנגדות", "Band Scapular Retraction"],
  [142, "mobility", "מתיחת מכופפי הירך", "Hip Flexor Stretch"],
  [143, "mobility", "מתיחת שרירי הירך האחורית", "Hamstring Stretch"],
  [144, "mobility", "מתיחת השריר הארבע-ראשי", "Quadriceps Stretch"],
  [145, "mobility", "מתיחת שרירי השוק האחוריים", "Calf Stretch"],
  [146, "mobility", "סיבובי עמוד השדרה החזי", "Thoracic Spine Rotation"],
  [147, "mobility", "פתיחת בית החזה בשכיבה על הצד", "Side-Lying Thoracic Opener"],
  [148, "mobility", "תנועת חתול-פרה", "Cat-Cow"],
  [149, "mobility", "מוביליות קרסול מול קיר", "Knee-to-Wall Ankle Mobilization"],
  [150, "mobility", "הרחקת ירך בשכיבה על הצד", "Side-Lying Hip Abduction"],
] as const;

/** Conservative lookup normalization only; intentionally no fuzzy matching. */
export function normalizeCore150ExerciseName(value: string): string {
  return normalizeSearchText(value);
}

function uniqueAliases(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeCore150ExerciseName(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (LEGACY_CORE_150_EXERCISE_NAMES.length !== CORE_150_V2_DEFINITIONS.length) {
  throw new Error("Core 150 V2 must map exactly one legacy name per exercise number");
}

export const CORE_150_EXERCISES: readonly Core150Exercise[] = Object.freeze(
  CORE_150_V2_DEFINITIONS.map(
    ([exerciseNumber, muscleGroup, canonicalHebrewName, englishName], index) => {
      if (exerciseNumber !== index + 1) {
        throw new Error(`Core 150 exercise numbers must be sequential; found ${exerciseNumber}`);
      }

      const legacyHebrewName = LEGACY_CORE_150_EXERCISE_NAMES[index];
      return Object.freeze({
        exerciseNumber,
        canonicalHebrewName,
        englishName,
        muscleGroup,
        aliases: Object.freeze(
          uniqueAliases([
            englishName,
            ...(legacyHebrewName !== canonicalHebrewName ? [legacyHebrewName] : []),
          ]),
        ),
      });
    },
  ),
);

const EXERCISE_BY_NUMBER = new Map(
  CORE_150_EXERCISES.map((exercise) => [exercise.exerciseNumber, exercise] as const),
);
const EXERCISE_BY_NORMALIZED_NAME = new Map<string, Core150Exercise>();

for (const exercise of CORE_150_EXERCISES) {
  if (!exercise.englishName.trim()) {
    throw new Error(`Core 150 exercise ${exercise.exerciseNumber} has no English name`);
  }

  for (const name of [exercise.canonicalHebrewName, ...exercise.aliases]) {
    const key = normalizeCore150ExerciseName(name);
    const existing = EXERCISE_BY_NORMALIZED_NAME.get(key);
    if (existing && existing.exerciseNumber !== exercise.exerciseNumber) {
      throw new Error(
        `Ambiguous Core 150 name "${name}" maps to exercises ${existing.exerciseNumber} and ${exercise.exerciseNumber}`,
      );
    }
    EXERCISE_BY_NORMALIZED_NAME.set(key, exercise);
  }
}

for (const [index, legacyName] of LEGACY_CORE_150_EXERCISE_NAMES.entries()) {
  const expectedNumber = index + 1;
  const resolved = EXERCISE_BY_NORMALIZED_NAME.get(normalizeCore150ExerciseName(legacyName));
  if (resolved?.exerciseNumber !== expectedNumber) {
    throw new Error(
      `Legacy Core 150 name "${legacyName}" must resolve to exercise ${expectedNumber}`,
    );
  }
}

export const CORE_150_EXERCISE_NAMES = Object.freeze(
  CORE_150_EXERCISES.map((exercise) => exercise.canonicalHebrewName),
);

export const CORE_150_EXERCISE_NAME_SET: ReadonlySet<string> = new Set(CORE_150_EXERCISE_NAMES);

export function getCore150ExerciseByNumber(exerciseNumber: number): Core150Exercise | undefined {
  return EXERCISE_BY_NUMBER.get(exerciseNumber);
}

export function findCore150ExerciseByName(
  name: string | null | undefined,
): Core150Exercise | undefined {
  if (!name?.trim()) return undefined;
  return EXERCISE_BY_NORMALIZED_NAME.get(normalizeCore150ExerciseName(name));
}

export function isCore150ExerciseName(name: string | null | undefined): boolean {
  return findCore150ExerciseByName(name) !== undefined;
}
