import type { AdvisorId } from "./advisor-core";

export type { AdvisorId } from "./advisor-core";

export type AdvisorIcon = "recovery" | "strength" | "movement" | "nutrition";

export interface CoachAdvisor {
  id: AdvisorId;
  name: string;
  field: string;
  tagline: string;
  intro: string;
  icon: AdvisorIcon;
  initials: string;
  media: {
    cover: string;
    hero: string;
    coverPosition: string;
    heroPosition: string;
  };
  quickActions: readonly [string, string, string, string];
}

export const COACH_ADVISORS: readonly CoachAdvisor[] = [
  {
    id: "adam",
    name: "אדם",
    field: "התאוששות ואורח חיים בריא",
    tagline: "עוזר לך לאזן עומס, שינה והרגלים בדרך שמתאימה ליום שלך.",
    intro: "בוא נבחן יחד איך הגוף מרגיש ומה יכול לעזור לך להתאושש היום.",
    icon: "recovery",
    initials: "א",
    media: {
      cover: "/advisors/adam-cover.png",
      hero: "/advisors/adam-hero.png",
      coverPosition: "50% 25%",
      heroPosition: "50% 28%",
    },
    quickActions: [
      "איך ההתאוששות שלי היום?",
      "ישנתי גרוע, מה לעשות?",
      "כדאי לי לקחת יום קל?",
      "איך לשפר את השגרה שלי?",
    ],
  },
  {
    id: "daniel",
    name: "דניאל",
    field: "Strength & Gym",
    tagline: "מתרגם מטרות ועומס לתוכנית אימון ברורה ומעשית.",
    intro: "ספר לי מה המטרה והזמן שעומד לרשותך, ונבנה כיוון לאימון.",
    icon: "strength",
    initials: "ד",
    media: {
      cover: "/advisors/daniel-cover.png",
      hero: "/advisors/daniel-hero.png",
      coverPosition: "50% 24%",
      heroPosition: "50% 24%",
    },
    quickActions: [
      "איזה אימון לעשות היום?",
      "במה להחליף את התרגיל הזה?",
      "יש לי רק 30 דקות",
      "כמה סטים וחזרות לעשות?",
    ],
  },
  {
    id: "maya",
    name: "מאיה",
    field: "Movement & Sport",
    tagline: "מוצאת דרכים פשוטות להכניס יותר תנועה לכל סוג של יום.",
    intro: "נמצא פעילות שמתאימה לאנרגיה, לזמן ולסביבה שלך עכשיו.",
    icon: "movement",
    initials: "מ",
    media: {
      cover: "/advisors/maya-cover.png",
      hero: "/advisors/maya-hero.png",
      coverPosition: "50% 24%",
      heroPosition: "50% 26%",
    },
    quickActions: [
      "איך להיות פעיל היום?",
      "תני לי פעילות של 20 דקות",
      "הליכה או אירובי היום?",
      "איך לשלב יותר תנועה ביום עמוס?",
    ],
  },
  {
    id: "shiran",
    name: "שירן",
    field: "תזונה וקולינריה בריאה",
    tagline: "מחברת בין תזונה טובה, אוכל טעים ומה שבאמת יש בבית.",
    intro: "ספר לי מה אכלת או מה יש במטבח, ונחשוב על האפשרות הבאה.",
    icon: "nutrition",
    initials: "ש",
    media: {
      cover: "/advisors/shiran-cover.png",
      hero: "/advisors/shiran-hero.png",
      coverPosition: "50% 22%",
      heroPosition: "50% 23%",
    },
    quickActions: [
      "מה כדאי לי לאכול עכשיו?",
      "מה להכין ממה שיש בבית?",
      "חסר לי חלבון היום?",
      "תני לי משהו טעים ובריא",
    ],
  },
] as const;

export function getCoachAdvisor(id: string): CoachAdvisor | undefined {
  return COACH_ADVISORS.find((advisor) => advisor.id === id);
}
