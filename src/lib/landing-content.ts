/**
 * VIORA-LANDING-001 — single source of truth for all landing page copy.
 * Edit headlines, cards and trust points here only.
 */

export type LandingFeature = {
  id: string;
  icon: string;
  title: string;
  line: string;
};

export const landingContent = {
  /** Main hero headline — edit here. */
  headline: "המאמן האישי שחושב איתך.",
  /** Short supporting sentence. */
  subheadline: "אימונים, התאוששות, תזונה ובינה מלאכותית. הכל במקום אחד.",
  eyebrow: "Viora Intelligence",

  cta: {
    primary: "התחל עכשיו",
    secondary: "יש לי כבר חשבון",
  },

  featuresTitle: "מה Viora עושה בשבילך",
  features: [
    { id: "coach", icon: "sparkles", title: "מאמן AI", line: "מבין את הגוף שלך ומדבר איתך בגובה העיניים." },
    { id: "workouts", icon: "dumbbell", title: "אימונים חכמים", line: "כל סט נשמר, נמדד ומשתפר מאימון לאימון." },
    { id: "progress", icon: "trending-up", title: "ניתוח התקדמות", line: "מגמות אמיתיות לאורך זמן, בלי ניחושים." },
    { id: "nutrition", icon: "salad", title: "תזונה", line: "צילום ארוחה אחד — ניתוח מלא של רכיבים ומאקרו." },
    { id: "hydration", icon: "droplets", title: "שתייה", line: "יעד יומי שמתעדכן לפי היום שעברת." },
    { id: "recovery", icon: "moon", title: "התאוששות", line: "שינה, כאב ועומס — מחוברים לתמונה אחת." },
    { id: "planning", icon: "calendar-days", title: "תכנון חכם", line: "שבוע אימונים שמתאים למשמרות ולחיים שלך." },
  ] satisfies LandingFeature[],

  trustTitle: "למה לסמוך על Viora",
  trust: [
    "מאמן AI אישי",
    "אינטליגנציית אימון",
    "הנתונים שלך פרטיים",
    "בנוי להתקדמות לטווח ארוך",
  ],

  /** Reserved for future sprints — not rendered yet. */
  future: {
    testimonials: [] as { name: string; quote: string }[],
    successStories: [] as { name: string; result: string }[],
    community: null,
    premium: null,
  },
};
